# P1 Tier — Line-up (reconcile -> sequence -> spec)

**Date:** 2026-07-04 · **Base:** `origin/main = 7249df1` (after Waves 5+6) · **Status:** PLAN ONLY — nothing built.
Produced by the `p1-lineup` workflow (35 agents / 2.7M tokens): 15 per-area reconcile agents -> 10 adversarial verifiers -> 3-lens sequence panel + synthesis -> 6 Wave-7 spec agents.

## Reconciliation of the 55 register P1s vs shipped code
| bucket | n |
|---|---|
| DONE (already shipped, dropped) | 3 |
| PARTIAL | 7 |
| OPEN | 45 |
| OUT-OF-SCOPE | 0 |
| verify overturns | 0 |

**Already DONE (dropped):**
- **P1-3** Lost-value KPI and winback list — qms.html:577 lostValueReport(d,w,m) (banner 'V6 Wave 1: Lost ₹ KPI') renders report-rows Today / Last 7 Days / Last 31 Days as ₹d.lost/₹w.lost/₹m.lost PLUS a 'Top Lost Leads · last
- **P1-52** Udhaar (credit/khata) ledger with outstanding ageing — _extracted_modules/expense.html: getUdhaar/saveUdhaar (key K.udhaar='saagar_udhaar_ledger_v1'), addReceivable (line 1477), payReceivable with settlements[] part-payments (1489), ud
- **P1-53** Festival and wedding-season planner — _extracted_modules/planning.html (module 'planning', key 'saagar_festival_calendar_v1'): per-store targets titanworld/helios (saveFestival line 104-106), live QMS actuals via actua

**Dropped in sequencing:**
- **P1-49** Admin auto-relock + optional app-open lock — Duplicate of P1-37. Its own notes state it is 'the same deliverable as P1-37 — build once and satisfy both'; the auto-relock half is already shipped and verified, and the only remaining piece (app-open lock) IS P1-37, which is scheduled in Wave 13. Scheduling both would double-count the same build.
- **P1-55** Native GST invoice/receipt PDF for service jobs and counter sales — PARTIAL and niche. The service-centre GST invoice is fully shipped and robust (Wave 3). The only residual is a generic counter-sale entry point reusing the existing serviceTaxInvoice builder off the existing saagar_invoice_seq_v1 counter — a nice-to-have generalization of already-shipped code, not an open gap. Most billing is franchise POS (explicitly out of scope), so it is lower-frequency than the revenue-capture items prioritised above. Revisit as a small follow-on once a host module for counter sales is settled.

## The 7-wave plan (52 open items)
Each wave = one file/owner (one blob re-encode).

### Wave 7 — Front-desk cluster — QMS + Service _(8 items · Mixed S/M — mostly S (P1-1,4,54,9,11), M for P1-2 (Capacitor FS archive read), P1-10 (stageLog+TAT), P1-42 (cross-frame master lookup))_
**Theme:** Customer-lifecycle capture: recovered-sale value, walk-in fidelity, repeat-customer recognition, service collections & pickup notify

**Why now:** Highest value-per-effort and lowest blast radius: both QMS (qms.html) and Service (service.html) round-trip whole-object JSON with no per-record normalizer to strip fields, so every new field survives reads with zero carry-trap work. Directly lights up recovered-sale rupees, collected-service revenue and repeat-customer signals owners cannot see today. Two adjacent front-desk blobs, each re-encoded once.

**Files:** _extracted_modules/qms.html + _extracted_modules/service.html (re-encode into www/index.html); P1-2 exposes a read-only window.qmsArchiveLookup in index.html; P1-42 reads saagar_customer_master_v1 cross-frame via window.parent

| item | eff/risk | feature |
|---|---|---|
| P1-1 | S/low | Capture recovered sale value when a follow-up is marked Converted |
| P1-4 | S/low | 'No mobile given' walk-in capture |
| P1-54 | S/low | Birthday/anniversary WhatsApp greeting list |
| P1-42 | M/med | Repeat-customer recognition at QMS entry and Service intake |
| P1-9 | S/low | Collected-revenue figure (month) from final amounts |
| P1-11 | S/low | One-tap customer notify when stage becomes 'Ready for Pickup' |
| P1-10 | M/low | Stage history timestamps + turnaround-time report |
| P1-2 | M/low | Archive lookup in Visit History |

### Wave 8 — Daily Staff Register — dsr.html _(4 items · S for P1-13/P1-15; M for P1-14/P1-12 (both med-risk: locked-record write-back + bridge re-emit))_
**Theme:** Point-of-sale capture, non-buyer follow-up pipeline, SM unlock-with-audit, WhatsApp EOD summary

**Why now:** Single owner (dsr.html), re-encoded once, with the P1-13→P1-14 dependency satisfied in-order. P1-13 (mobile + payment mode) and P1-14 (non-purchase follow-up) share the normEntry/migrateRecord carry path (~L1490-1545) so migrate defaults are touched once. P1-12 (SM unlock-for-correction) also lives here and touches the same record shape plus the bridge merge/DSR_SUBMITTED re-emit — safest with the owner who just edited the schema. P1-15 (EOD WhatsApp, already 60% done) is a small renderDashboard button riding the same re-encode.

**Files:** _extracted_modules/dsr.html (re-encode); P1-15 also touches www/whatsapp-share.js + the DSR WA template in www/index.html; P1-12/P1-14 verify integration-bridge.js _mergeBridgeRows / DSR_SUBMITTED re-fire

| item | eff/risk | feature |
|---|---|---|
| P1-13 | S/low | Customer mobile + payment mode on manual sales _(partial)_ |
| P1-14 | M/med | Non-purchase follow-up pipeline |
| P1-15 | S/low | WhatsApp end-of-day DSR summary _(partial)_ |
| P1-12 | M/med | SM 'Unlock for correction' with audit trail |

### Wave 9 — Stock Register + its bridge reads — stock.html + integration-bridge.js _(6 items · S for P1-5/P1-8/P1-40; M for P1-6/P1-43; P1-7 med-risk (new Submit/Lock gate))_
**Theme:** Lock/submit audit stamps, theft remark+SM-verify gate, monthly variance/shrinkage, sales reconciliation, and the read-only bridge exceptions

**Why now:** One module owner (stock.html) plus the single file that reads its blobs (integration-bridge.js), opened once. All stock items share the normaliseImportData carry-trap (L2249-2285) so the new fields (lockedBy/submittedBy/reopenedCount/theftRemark/theftVerified) are added in one place. Order: P1-5 stamps → P1-7 adds the theft gate (med-risk, must not break theft==0 flow) → P1-6 shrinkage report consumes theft remarks → P1-8 reconciliation. Fold in the other read-only bridge pushes (P1-40 follow-ups-due, P1-43 cash cross-check) since buildExceptions is already open — bridge edited once, writes only saagar_exceptions (no wholesale-save race).

**Files:** _extracted_modules/stock.html (re-encode) + www/integration-bridge.js (buildExceptions, _dsrRollup salesCount, theft exception)

| item | eff/risk | feature |
|---|---|---|
| P1-5 | S/low | Lock/submit audit stamps (who + when + re-open count) |
| P1-7 | S/med | Theft entries require a remark and SM verify |
| P1-6 | M/low | Monthly variance & shrinkage report per store/brand |
| P1-8 | S/low | Sales units cross-check against DSR/QMS in Summary |
| P1-40 | S/low | Follow-ups due today on Home / Exceptions Hub |
| P1-43 | M/med | Cash cross-check exception (QMS sales vs cash statement) |

### Wave 10 — Expense Manager — expense.html _(4 items · S for P1-19; M for P1-16/P1-17; P1-18 S but med-risk (write-path enforcement))_
**Theme:** Recurring templates, entry-time budget alerts, GST capture, and month-lock/stale-feed enforcement

**Why now:** All four are the Expense module, one owner, one re-encode. They share the normEntry carry discipline (source/sourceRef already carried; add gstAmount/gstRatePct + tax-feed fingerprint) and the same addEntry/editEntry/voidEntry write path, so one owner reasons about the ledger holistically. Order: P1-16 + P1-19 (low-risk additive UI) → P1-17 (persisted GST fields + per-category rate map) → P1-18 last (med-risk write-path gate with owner-override-with-reason) so the lock guards the GST-enriched ledger. Bridge income-append path is explicitly out of the enforcement scope, so no cross-file scatter.

**Files:** _extracted_modules/expense.html (re-encode); reads saagar_master_vendors gstin at render time (no bridge edit)

| item | eff/risk | feature |
|---|---|---|
| P1-16 | M/low | Recurring expense templates (rent, salaries, utilities, insurance) |
| P1-19 | S/low | Budget alert at entry time + copy-last-month budgets |
| P1-17 | M/low | GST capture: vendor GSTIN + GST-amount field on expense entries, per-category rate for the estimate |
| P1-18 | S/med | Enforce month lock + stale-tax-feed warning |

### Wave 11 — People-ops modules — Grooming + CRO Audit + Payroll statutory _(9 items · S for P1-20/P1-21/P1-23/P1-48; M for P1-22/P1-24/P1-26/P1-27; P1-25 S (bridge read-only))_
**Theme:** Grooming visibility (top-failed, store-split, checkedBy), CRO auto-fill + per-store targets + audit-pending, payroll statutory persistence & filing-ready outputs

**Why now:** Three tight single-owner sub-clusters that never cross each other's blobs. Grooming (grooming.html, zero normalizers — plainly additive): P1-20 top-failed, P1-21 store dimension, P1-22 checkedBy. CRO Audit (cro_audit.html): P1-23 auto-fill bills from QMS feed, P1-24 per-store targets on cro_s_v3 (backward-compat byStore map), P1-25 audit-pending exception (one buildExceptions add). Payroll statutory (payroll.html + saagar-report.js): P1-48 first (persists statTotals the month-end pack reads), then P1-26 member-wise ECR/ESIC CSV and P1-27 F&F settlement builder. Larger wave but three self-contained owners; splitting would force re-opening the report engine and bridge again.

**Files:** _extracted_modules/grooming.html, cro_audit.html, payroll.html (each re-encoded once) + www/integration-bridge.js (P1-25) + www/saagar-report.js (P1-26 PDF variant, P1-27 fnfSettlement builder)

| item | eff/risk | feature |
|---|---|---|
| P1-20 | S/low | Most-failed parameters report |
| P1-21 | S/low | Store-wise grooming view (WLMHW vs HEMW) |
| P1-22 | M/low | checkedBy accountability stamp |
| P1-23 | S/low | Auto-fill Bills/Invoices from QMS feed |
| P1-24 | M/med | Per-store targets and store dimension _(partial)_ |
| P1-25 | S/low | 'Audit pending today' exception + reminder |
| P1-48 | S/low | Persist statutory totals at payroll lock so the Month-end pack includes them |
| P1-26 | S/low | Member-wise statutory register (filing-ready CSV/PDF) |
| P1-27 | M/low | Full & Final settlement document |

### Wave 12 — Leave Calendar + Payroll reconciliation + Tax module _(9 items · S for P1-30/P1-29/P1-33/P1-41; M for P1-28/P1-31/P1-32/P1-34/P1-35 (several med-risk: store carry, source-swap, QRMP visibility branch))_
**Theme:** Per-store leave capacity & staffing strip & blackouts, payroll leave-source reconciliation, tax evidence/CA-pack/ZIP/QRMP & statutory card

**Why now:** Two independent single-owner blobs batched. Leave (leave.html, one owner): P1-28 (per-store capacity — a one-line bridge reconcileMasters store-carry + new leavedesk_caps_v1 sibling key) lands before P1-30 (next-7-days strip, deps P1-28), then P1-29 (blackout sibling key). P1-31 (payroll reconciliation) is a read-only leavedesk_v3 month-sum swap inside payroll.html — self-contained. Tax (tax.html, one owner): P1-32 completeness map, P1-33 CA WhatsApp pack, P1-34 evidence ZIP (reuses shipped JSZip), P1-35 QRMP flag, plus P1-41 statutory-payable card — all share the taxcal_v2 record so one owner keeps its shape coherent.

**Files:** _extracted_modules/leave.html + www/integration-bridge.js (P1-28 store carry) + _extracted_modules/payroll.html (P1-31 read-only) + _extracted_modules/tax.html; P1-33 adds a WA_CFG.tax template in www/index.html

| item | eff/risk | feature |
|---|---|---|
| P1-28 | M/med | Per-store capacity view (WLMHW vs HEMW) |
| P1-30 | S/low | Next-7-days staffing strip |
| P1-29 | S/low | Peak-season blackout dates + store holiday markers |
| P1-31 | M/med | One-tap payroll reconciliation view _(partial)_ |
| P1-32 | M/med | Evidence-pack completeness tracking |
| P1-33 | S/low | CA share pack per firm |
| P1-34 | M/med | Audit-ready evidence ZIP export (firm + FY) |
| P1-35 | M/med | QRMP filing-frequency flag per firm |
| P1-41 | S/low | Statutory payable card in the Tax module _(partial)_ |

### Wave 13 — Shell chrome + Reports/Backup + Security bridge channel _(10 items · M for P1-36/P1-38/P1-46/P1-47; S for P1-39/P1-44/P1-45/P1-37; P1-50 L/high-risk; P1-51 M/med-risk)_
**Theme:** i18n & attention-centre & text-size, rollback + report exports + weekly scope + lost-walkin sheet, then app-lock and the permission/PIN money-action channel

**Why now:** Isolate the two highest-blast-radius plain-text files (index.html shell + saagar-report.js) for last, after every additive module change has landed and been proven. Shell chrome (P1-36 i18n, P1-38 attention dismiss/snooze, P1-39 text-size) hits the same Settings/render region. Reports/backup (P1-44 rollback, P1-45 lost-walkin sheet, P1-46 CSV export, P1-47 weekly scope) is one owner's saagar-report.js/index.html pass. Security ends the plan, prerequisite-first: P1-37 (app-launch PIN lock — must fail-open with no PIN, satisfies the dropped P1-49 too) → P1-50 (action-permission matrix + the NEW shell↔iframe request/response channel, L/high) → P1-51 (PIN-confirm on money actions, deps P1-50). Wiring the money-flow gates only after Waves 8-11 modules are stable minimises corruption of in-flight edits.

**Files:** www/index.html (i18n, attention, text-size, app-lock, permission matrix + editor, VERIFY_PIN channel) + www/saagar-report.js (CSV emitter, weekly builder, lostWalkinCallSheet); P1-50/P1-51 also blob-edit expense.html can() and payroll.html setRunStatus/lockRun to consult the shell verdict

| item | eff/risk | feature |
|---|---|---|
| P1-36 | M/med | Marathi/Hindi label toggle for shell chrome |
| P1-38 | M/low | Attention Centre with dismiss/snooze |
| P1-39 | S/med | Text-size setting (Normal / Large) |
| P1-44 | S/med | Undo last restore / module reset |
| P1-45 | S/low | Lost walk-in follow-up list (weekly/monthly call sheet) |
| P1-46 | M/low | CSV/Excel export alongside PDF for register reports |
| P1-47 | M/med | Weekly report scope + last-period comparison |
| P1-37 | M/med | App-launch PIN lock (whole app) |
| P1-50 | L/high | Action-level permission matrix (approve / void / lock / reopen) |
| P1-51 | M/med | Verified approvals: PIN-confirm on money actions |

## Recommended first: **Wave 7** — specs attached for: P1-1, P1-9, P1-4, P1-54, P1-42, P1-11

52 open P1 items sequenced into 7 build waves, each one file/owner so a module's base64 blob is only edited and re-encoded once. Start with Wave 7 (Front-desk: QMS + Service) — the highest-value, lowest-risk batch that puts recovered-sale rupees, collected-service revenue, and repeat-customer recognition on screen with zero carry-trap risk. Waves 8-10 harden the daily money modules (DSR, Stock+bridge, Expense). Wave 11 covers people-ops reports (grooming, CRO audit, payroll statutory). Wave 12 does leave-capacity + tax compliance. Wave 13 isolates the risky shell/security/report-engine work last. Two items dropped: P1-49 duplicates P1-37, and P1-55's remaining scope is a niche counter-sale add-on to already-shipped invoicing.

---
## Wave 7 implementation specs

### P1-1 — Capture recovered sale value when a follow-up is marked Converted
- **Target:** Edit the DECODED module V:/Co work/Projects/Retail/_extracted_modules/qms.html, then re-encode that whole file to base64 and replace the qms module blob inside V:/Co work/Projects/Retail/saagar-control-centre/www/index.html (the module lives as a base64 string in index.html; keep the extracted copy in sync as the working source). Functions/regions to touch, all in qms.html: (1) updateFollowup(id,status) at line 559 — intercept status==='Converted' to open a capture modal; (2) NEW helper confirmConvertFollowup(id) placed right after updateFollowup; (3) NEW helper recoveredValueReport(d,w,m) placed right after lostValueReport (line 577); (4) calcStats(list) at line 461 — add an additive 'recovered' sum field; (5) renderReports() at line 568 — insert a 'Follow-up Recovered ₹' card next to the existing Lost ₹ card; (6) OPTIONAL croPerfRows(rot) line 571 + croPerformanceTable() line 572 — add a per-CRO 'Recovered ₹' column. Do NOT touch load()/save() (lines 422/423) — they already round-trip the whole state as JSON. Do NOT edit storage-core.js / sqlite-store.js / photo-store.js.
- **Additive-safe:** true
- **Approach:** ADDITIVE, offline, no libs. STEP 1 — Gate the Converted action behind a capture modal. Change updateFollowup so that when status==='Converted' it does NOT immediately write; instead it opens a small modal (reuse existing openModal/closeModal at lines 428/427) prompting for a recovered amount (+ optional bill no.), then confirmConvertFollowup(id) does the write. Keep the current one-line behaviour for 'Done' and 'Lost' unchanged. Concretely, in updateFollowup add at the top after the guardWrite/find lines: `if(status==='Converted'){return openConvertModal(f);}`. Add openConvertModal(f) and confirmConvertFollowup(id):
  function openConvertModal(f){openModal('Mark Converted — '+esc(f.queueNo),`<div class="form-grid"><div class="field"><label class="label">Recovered Amount (₹) *</label><input class="input" id="fuRecoveredValue" type="number" min="0" inputmode="numeric" placeholder="e.g. 12500"></div><div class="field"><label class="label">Bill No. (optional)</label><input class="input" id="fuRecoveredBill" placeholder="Bill / invoice no."></div></div>`,`<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="confirmConvertFollowup('${f.id}')">Mark Converted</button>`,true);}
  function confirmConvertFollowup(id){if(!guardWrite())return;const f=state.followups.find(x=>x.id===id);if(!f)return;const amt=Math.max(0,Math.round(+$('fuRecoveredValue').value||0));if(!amt){toast('Recovered amount required.','error');return;}const bill=$('fuRecoveredBill').value.trim();f.status='Converted';f.recoveredValue=amt;f.recoveredBill=bill;f.convertedAt=new Date().toISOString();f.closedAt=f.convertedAt;f.closedBy=role;closeModal();save('followup.convert',{queueNo:f.queueNo,recovered:amt});toast('Follow-up converted · ₹'+amt.toLocaleString('en-IN'),'success');}
Note guardWrite() (line 415) blocks past-date / EOD-locked writes and toasts already — call it BEFORE opening the modal too so a locked day never even prompts: put `if(!guardWrite())return;` as the first line of updateFollowup (it is already there) and, since updateFollowup returns openConvertModal before doing its own write, that single guard covers the Converted path opening. STEP 2 — calcStats recovered sum. In calcStats add, mirroring the existing `lost` field, a recovered sum over followups (NOT customers, since recovery lives on followups). Because calcStats currently only receives a customer list, compute recovered separately inside the report windows instead (cleaner, avoids changing calcStats' signature): add a standalone helper `function recoveredInWindow(days){const since=new Date();since.setDate(since.getDate()-days+1);since.setHours(0,0,0,0);return state.followups.filter(f=>f.status==='Converted'&&(+f.recoveredValue||0)>0&&new Date(f.convertedAt||f.closedAt||0)>=since).reduce((s,f)=>s+(+f.recoveredValue||0),0);}` and a `function recoveredToday(){return recoveredInWindow(1);}`. This keeps calcStats untouched (lower risk) — prefer this over editing calcStats. STEP 3 — recoveredValueReport(d,w,m) mirrors lostValueReport exactly (line 577): three rows Today/7d/31d using recoveredInWindow(1)/recoveredInWindow(7)/recoveredInWindow(31); then a 'Top Recovered · last 31 days' table of the top 5 converted followups by recoveredValue (customer name via f.customerName, mobile via f.mobile, ₹ recoveredValue, bill recoveredBill||'—'). Window keys on f.convertedAt with fallback to f.closedAt (seeded/legacy Converted rows have closedAt but no convertedAt). STEP 4 — renderReports card. In renderReports, immediately after the existing Lost ₹ card block `<div class="card" ...>${lostValueReport(daily,weekly,monthly)}</div></div>`, insert a sibling card: `<div class="card" style="margin-bottom:16px"><div class="card-head"><div><div class="card-title">Follow-up Recovered ₹</div><div class="card-sub">Recovered value · converted follow-ups</div></div></div><div class="card-body">${recoveredValueReport(daily,weekly,monthly)}</div></div>`. (daily/weekly/monthly args are passed for signature symmetry with lostValueReport; recoveredValueReport ignores them and reads followups directly.) STEP 5 (OPTIONAL, low-risk) — per-CRO recovered. In croPerfRows add to each returned row: `recovered:state.followups.filter(x=>x.croId===c.id&&x.status==='Converted'&&(x.convertedAt||x.closedAt||'').slice(0,10)===todayISO()).reduce((s,x)=>s+(+x.recoveredValue||0),0)` and in croPerformanceTable add a `<th>Recovered ₹</th>` header and a `<td>₹${r.recovered.toLocaleString('en-IN')}</td>` cell. If included, mirror the same two additions into printReports() (line 589) croRows/croBody so the printed report matches; if that adds risk, SKIP the per-CRO column entirely — it is explicitly optional and the primary deliverable (modal + report card) stands alone. Re-encode qms.html to base64 and swap the blob in index.html.
- **Data model:** localStorage key touched: retail_queue_management_v1 (STORE_KEY, qms.html:387) — the whole `state` object. NEW OPTIONAL per-followup fields written onto entries of state.followups[] (only on Converted, going forward):
 - f.recoveredValue : number, rupees recovered. Default when absent = treat as 0 (all reads use `+f.recoveredValue||0`). Required (>0) in the capture modal.
 - f.recoveredBill : string, optional bill/invoice no. Default '' when absent; reads use `f.recoveredBill||'—'`.
 - f.convertedAt : ISO timestamp string set at conversion. Default when absent = fall back to f.closedAt (every reader uses `f.convertedAt||f.closedAt`). This is the field the report windows key on, per the reconcile note.
CARRY / round-trip safety (CRITICAL point — and it is already satisfied): load() at qms.html:422 does `state.followups=state.followups||[]` with NO per-record normalizer that rebuilds/whitelists followup fields, and save() at :423 does `JSON.stringify(state)` of the entire object. Therefore any new keys on a followup survive read round-trips automatically — there is NO drop-on-normalize trap here (unlike modules with a normEntry()). Do NOT add a normalizer; do NOT change load()/save(). No new top-level localStorage keys. No existing key/field renamed or reshaped. Existing followup fields (id, customerId, queueNo, customerName, mobile, croId, dueDate, mode, notes, status, createdAt, closedAt, closedBy) are untouched — the feature only sets closedAt/closedBy (already set today) plus the three new optional fields. calcStats is left unchanged (recovered totals come from the new recoveredInWindow() helper reading state.followups), so no consumer of calcStats' return shape is affected — the new `recovered` concept is additive via a separate helper, not a mutated return object.
- **UI:** WHERE: (a) Follow-ups tab (renderFollowups, qms.html:558) — the existing 'Converted' button already calls updateFollowup(id,'Converted'); no markup change needed there, the button now opens a modal instead of silently flipping status. (b) A new capture MODAL via openModal (small=true). (c) Reports tab (renderReports, :568) — a new full-width card 'Follow-up Recovered ₹' placed directly under the existing 'Lost ₹' card, visually mirroring it. (d) OPTIONAL: a 'Recovered ₹' column on the CRO Performance table.
CONTROLS + COPY — Modal title: 'Mark Converted — <queueNo>'. Field 1 label 'Recovered Amount (₹) *' (number input, min 0, inputmode numeric, placeholder 'e.g. 12500', required). Field 2 label 'Bill No. (optional)' (text input, placeholder 'Bill / invoice no.'). Footer buttons: ghost 'Cancel' (closeModal), primary 'Mark Converted' (confirmConvertFollowup). Validation toast on empty/zero amount: 'Recovered amount required.' (error). Success toast: 'Follow-up converted · ₹<amount>' (success).
Report card — title 'Follow-up Recovered ₹', card-sub 'Recovered value · converted follow-ups'. Body = three report-rows (reuse existing .report-row/.rk/.rv classes): 'Today' / 'Last 7 Days' / 'Last 31 Days' each showing '₹<n>'.toLocaleString('en-IN'). Below, when any exist, a 'Top Recovered · last 31 days' mini-table (reuse .tbl-wrap/.tbl) with columns Customer | Mobile | Recovered ₹ | Bill. Empty state (reuse .empty-state): '<p>No recovered value recorded yet</p>'. All ₹ formatting via (+n||0).toLocaleString('en-IN') and all user strings passed through esc() (qms.html:394), matching lostValueReport exactly. Optional CRO column header 'Recovered ₹', cell '₹<n>'.
- **Edge cases:** 1) Legacy/seeded 'Converted' followups have no recoveredValue/convertedAt → they contribute 0 to totals (guarded by `(+f.recoveredValue||0)>0`) and are excluded from the Top table; window date uses `convertedAt||closedAt` so they still bucket correctly if ever given a value. Seed (demo-seed.js:528) emits status 'Converted' with closedAt set and no recoveredValue — verify the report shows ₹0 today until you convert a fresh one. 2) Amount 0 / blank / non-numeric → blocked with 'Recovered amount required.' toast; Math.max(0,Math.round(+val||0)) coerces junk to 0. 3) Past-date view or EOD-locked day → guardWrite() (qms.html:415) already toasts 'Viewing a past date — read-only.' / 'Edits locked after EOD close.' and returns before the modal opens (ensure the guard runs before openConvertModal). 4) Cancel in modal → closeModal(), no state change, status stays Pending. 5) Re-marking an already-Converted followup from the Completed table is not possible (buttons only render for Pending), so no double-count; if a Pending row is converted twice via race, confirmConvertFollowup overwrites the same fields idempotently (last write wins, single row). 6) Window boundary: recoveredInWindow zeroes time-of-day on `since` (setHours(0,0,0,0)) exactly like rangeStats' qms-bug-01 fix (:569) so the oldest day's early conversions aren't dropped; Today = window of 1 day (>= start of today). 7) Mobile missing on a converted followup → Top table shows '—' via esc(f.mobile||'—'). 8) Very large amount → toLocaleString handles grouping; no overflow concern for realistic retail values. 9) XSS: recoveredBill and customerName are rendered through esc(); recoveredValue is numeric-coerced, never interpolated as raw HTML. 10) printReports() parity: the Print button (:589) rebuilds reports independently — if the optional per-CRO column is added, mirror it there or the printed CRO table will differ from screen; if skipped, no print change needed since the new Recovered card is screen-only (acceptable — matches how some cards already differ) OR add a matching print section for completeness.
- **Verify:** Harness = load V:/Co work/Projects/Retail/saagar-control-centre/www/index.html in a browser (Preview/Chrome) with demo-seed.js seeding retail_queue_management_v1 (STORE_KEY). The QMS module runs inside an iframe; drive it via the iframe's contentWindow. CHECKS:
A) Modal gate: in the QMS iframe console call `updateFollowup(<pendingFollowupId>,'Converted')` (grab an id from `state.followups.filter(f=>f.status==='Pending')[0].id`) → assert the modal backdrop is visible (`!document.getElementById('modalBackdrop').classList.contains('hidden')`) and title reads 'Mark Converted — Q-###'. Confirm status is STILL 'Pending' at this point (no premature write).
B) Validation: with the modal open, leave amount blank and click 'Mark Converted' → toast 'Recovered amount required.' and status still 'Pending'.
C) Happy path: set `document.getElementById('fuRecoveredValue').value=12500; document.getElementById('fuRecoveredBill').value='INV-77';` then call `confirmConvertFollowup(id)` → assert the followup now has status==='Converted', recoveredValue===12500, recoveredBill==='INV-77', and a convertedAt ISO string; toast shows '₹12,500'.
D) Round-trip carry (the key regression): after C, run `load()` (re-reads localStorage) then re-find the same followup → assert recoveredValue/recoveredBill/convertedAt SURVIVE (proves no normalize drop). Equivalent: `JSON.parse(localStorage.getItem('retail_queue_management_v1')).followups.find(f=>f.id===id)` shows the three fields.
E) Report totals: switch to Reports tab (`showView('reports')` or click nav), confirm a 'Follow-up Recovered ₹' card renders; assert its Today row equals the sum of recoveredValue for today's converted followups (should now be >= 12500 after step C) and that the Top Recovered table lists the customer/₹12,500/INV-77 row. Cross-check `recoveredInWindow(31)` returns a number >= recoveredInWindow(7) >= recoveredInWindow(1).
F) Legacy zero: before any manual conversion, the seeded 'Converted' rows (no recoveredValue) yield Today/7d/31d = ₹0 and empty Top table ('No recovered value recorded yet') — confirms guarded reads.
G) Non-regression: 'Done' and 'Lost' buttons still flip status immediately with no modal (call updateFollowup(id,'Done') → status 'Done', no backdrop shown). Lost ₹ card unchanged.
H) If optional CRO column added: Reports CRO Performance table shows a 'Recovered ₹' column and the converting CRO's cell reflects today's ₹12,500.
No network calls, no new libs — purely localStorage + DOM.
- **Risk:** Effort S, risk low. Blast radius is confined to the QMS module (qms.html blob). The only behavioural change to an existing path is that 'Converted' now requires one extra modal step before writing — 'Done'/'Lost' are untouched. Chosen the lower-risk design of NOT modifying calcStats' signature/return (recovered totals come from a new standalone recoveredInWindow() helper), so no existing caller of calcStats is affected. Main pitfalls to avoid: (1) forgetting to re-encode qms.html to base64 into index.html after editing the extracted file — the extracted file is only the readable working copy; the app runs the base64 in index.html. (2) If adding the optional per-CRO column, remember printReports() (:589) rebuilds the CRO table separately and must be updated in parallel or it will diverge; safest to ship WITHOUT the optional column first. (3) Do not add a followup normalizer 'to be safe' — none exists and load() already carries new fields; adding one risks introducing the very drop-trap we're avoiding. No storage-layer files touched. No new keys. No wa.me/network. Fully offline.

### P1-4 — 'No mobile given' walk-in capture
- **Target:** Edit the DECODED module V:/Co work/Projects/Retail/_extracted_modules/qms.html, then re-encode that file to base64 and replace the QMS module's base64 payload inside V:/Co work/Projects/Retail/saagar-control-centre/www/index.html (module id "qms"). Functions/regions to touch, all in qms.html: renderEntry() (line 539) — add the checkbox + toggle handler; addCustomer() (line 542) — branch the validation/dedupe/routing on the checkbox. NO other files. Do NOT touch storage-core.js / sqlite-store.js / photo-store.js, and do NOT touch integration-bridge.js (it already tolerates blank mobile — see verification).
- **Additive-safe:** true
- **Approach:** Additive checkbox on the entry form that relaxes the mobile requirement for a walk-in who refuses to share a number, so the visit is still logged (keeping footfall + conversion base honest) while skipping every branch that needs a real number.

(1) renderEntry() (line 539): In the Mobile field block, change the label from "Mobile No. *" to "Mobile No." and add, immediately after the mobile <input>, a small inline checkbox row: <label style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:12px;color:var(--muted)"><input type="checkbox" id="noMobileChk" onchange="onNoMobileToggle()"> No number given (walk-in)</label>. Add a new function onNoMobileToggle() that, when checked: sets custMobile.value='' , custMobile.disabled=true, custMobile.placeholder='Not provided'; when unchecked: custMobile.disabled=false, placeholder back to '10 digit mobile'; in both branches call showCustomerHistory() so the history pane resets. (custMobile already has oninput=showCustomerHistory and maxlength=10 — leave those; a disabled input fires neither, which is fine.)

(2) addCustomer() (line 542): read the flag at the top: const noMobile = !!($('noMobileChk') && $('noMobileChk').checked); const mobile = noMobile ? '' : $('custMobile').value.trim(); Then branch:
 - Mobile guard: keep name-required always; only run the /^\d{10}$/ test when !noMobile. i.e. change to: if(!noMobile && !/^\d{10}$/.test(mobile)){toast('Mobile must be 10 digits.','error');return;} Keep the existing if(!name){...return} exactly as-is (name stays mandatory).
 - Duplicate check: guard it so it only runs with a real number: if(!noMobile){ const duplicate=todaysCustomers().find(c=>c.mobile===mobile&&!c.outcome); if(duplicate&&!confirm('This mobile has an open entry today. Continue?'))return; }
 - Customer object: keep mobile:mobile (which is '' when noMobile) and ADD noMobile:noMobile to the literal (additive optional field). Everything else in the literal is unchanged.
 - Routing: currently `if(sel){manualAllocate(c.id,sel)}else{routeWithPreclaim(c)}`. routeWithPreclaim() calls findActivePreclaim(c.mobile) (a mobile lookup). For a noMobile record skip pre-claim entirely by calling allocateCustomer directly: change the else branch to `else{ if(noMobile) allocateCustomer(c.id); else routeWithPreclaim(c); }`. (manualAllocate stays reachable when an SM picks a CRO — it does not touch mobile, so it is safe either way; leave it.)
 - Reset: clearEntryForm() already blanks custMobile; also un-check + re-enable the box after save. Add to addCustomer() right before/after clearEntryForm(): if($('noMobileChk')){$('noMobileChk').checked=false;} if($('custMobile')){$('custMobile').disabled=false;$('custMobile').placeholder='10 digit mobile';} (clearEntryForm calls showCustomerHistory which is a no-op on empty mobile.)

(3) Follow-up on close for a noMobile lead: In confirmCloseLead() (line 557), the Follow-up=Yes branch pushes state.followups with mobile:c.mobile — a follow-up needs a number (qmsWaFu/contactBtns). Guard it: when fu is true AND !c.mobile (i.e. noMobile record), reject with a toast('Cannot set a follow-up without a mobile number.','error') and return BEFORE mutating c.outcome/status, so the SM either unchecks Follow-up or the record closes cleanly. Do NOT auto-create the follow-up. (Do not alter the normal path where a mobile exists.)
- **Data model:** New OPTIONAL field on each QMS customer record (blob key STORE_KEY='retail_queue_management_v1', array state.customers[]):
 - c.noMobile : boolean, default absent/false. Set to true only when the 'No number given' box is checked at entry. Paired with the EXISTING field c.mobile which is set to '' (empty string, its normal type) for such records — no shape change, mobile is still a string.

CARRY / normalize analysis (the classic drop-on-normalize trap does NOT apply here, verified in code):
 - load() (line 422) parses the WHOLE blob with JSON.parse and does state.customers=state.customers||[]; it never rebuilds individual customer objects field-by-field, so c.noMobile round-trips intact. save() (line 423) is JSON.stringify of the whole state. There is NO per-customer normalize helper that reconstructs the object (normalizeCustomerStatus at line 502 only maps the status STRING, never the customer object). Therefore no CARRY edit is required — but the builder MUST NOT introduce any field-whitelisting normalize; keep storing/loading customers as the raw array.
 - Old records (pre-feature) have no noMobile key → read as undefined → falsy → treated exactly as a normal mobile-bearing record. Backward compatible.
 - calcStats() (line 461) uses total=list.length and conv=pur/total — noMobile records ARE counted in total/footfall and in the conversion denominator, which is the whole point (honest footfall). No calcStats change needed.
- **UI:** Location: Customer Entry view → "New Walk-in" card → the Mobile No. field (top-left of the form-grid), rendered by renderEntry() at line 539.
Controls/copy:
 - Field label changes "Mobile No. *" → "Mobile No." (asterisk removed, since it becomes conditionally optional).
 - New checkbox directly under the mobile input: unticked by default, label copy "No number given (walk-in)".
 - When ticked: mobile input is cleared, disabled and greyed with placeholder "Not provided"; Visit History pane shows its default "Enter mobile number to see history" empty state.
 - "Customer Name *" stays mandatory and unchanged. All other fields (Visit Type, Customer Type, Product Interest, Source, People, Priority, Allocate-to, Notes) unchanged.
 - Save button unchanged ("Save & Allocate CRO →"); on save the box resets to unticked and the input re-enables for the next walk-in.
 - Live Queue card (queueCard, line 549) needs NO change: contactBtns(c.mobile,...) already returns '' for an empty mobile via qmsTel10(''), so no phone/WhatsApp icons render and the mobile line shows blank — acceptable. (Optional nicety, NOT required: show a small grey "No number" badge; leave out to keep the change minimal.)
 - Close Lead modal: if the SM sets Follow-up Required=Yes on a no-number lead, closing shows the toast "Cannot set a follow-up without a mobile number." and does not close until they set it back to No.
- **Edge cases:** 1) Box ticked but name empty → still blocked by the unchanged if(!name) guard (name always required). 2) Box ticked → /^\d{10}$/ guard skipped; record saved with mobile:'' , noMobile:true. 3) Box unticked → identical to current behaviour (10-digit guard, dedupe, routeWithPreclaim all run). 4) Dedupe skipped for noMobile so two no-number walk-ins in one day never false-collide on ''. 5) Pre-claim skipped for noMobile (allocateCustomer called directly) — findActivePreclaim('') would otherwise match nothing but we skip it explicitly per spec. 6) SM "Allocate to" a specific CRO still works for noMobile (manualAllocate ignores mobile). 7) No rotation active → allocateCustomer sets status 'Waiting' (existing behaviour), same for noMobile. 8) Follow-up on close blocked for noMobile (no number to WhatsApp/call). 9) showCustomerHistory / qmsWaCust / contactBtns / qmsWaFu all already no-op or return '' on empty mobile (qmsTel10('')→'') — no crash, no bogus wa.me link. 10) Bridge harvest (integration-bridge.js lines 632-637): addCust(name, c.mobile||'') is name-guarded and pushes {name, mobile:''} without throwing; the derived mobile-keyed index (line 638+) naturally omits a blank-mobile row — no cross-module regression. 11) EOD lock / past-date: addCustomer still returns early on isPast()/eodLockActive() before any of the new logic — unchanged. 12) Toggling the box off after typing digits: onNoMobileToggle re-enables input but leaves it cleared; user re-enters the number. 13) A disabled mobile input is not submitted-relevant (we read the flag, not the disabled input's value) so the empty string is deterministic.
- **Verify:** Seeded browser harness (serve V:/Co work/Projects/Retail/saagar-control-centre/www via serve.js, open the QMS module; drive the module iframe's window). Reset with localStorage.removeItem('retail_queue_management_v1') between cases, then load() the module fresh.
A) Footfall-honest capture: switchView('entry'); set $('custName').value='Walk In Ravi'; check $('noMobileChk') and call onNoMobileToggle(); confirm $('custMobile').disabled===true. Call addCustomer(). ASSERT: state.customers has a new record with noMobile===true && mobile==='' && name==='Walk In Ravi' && a queueNo assigned && status is 'Allocated'/'Waiting' (not blocked). ASSERT calcStats().total incremented (footfall counts it).
B) Guard skip proven: with the box UNCHECKED and mobile left blank, addCustomer() must still toast 'Mobile must be 10 digits.' and NOT push a record (regression guard that the 10-digit rule still fires normally).
C) Round-trip survival: after case A, call save() then load() again (or re-read JSON.parse(localStorage.getItem('retail_queue_management_v1'))); ASSERT the record still has noMobile===true (drop-on-normalize trap check).
D) No pre-claim / no dedupe: add two no-number walk-ins in one session; ASSERT both are stored (no 'open entry today' confirm blocks the second) and no preclaim was consulted (state.preclaims unchanged).
E) Follow-up block: open a no-number lead's Close modal, set Outcome=Non Purchase, Follow-up Required=Yes, call confirmCloseLead(id). ASSERT it toasts 'Cannot set a follow-up without a mobile number.', state.followups did NOT grow, and c.status is NOT yet 'Closed'; then set Follow-up=No and confirm it closes and calcStats().non increments.
F) Contact no-op: for the no-number record, ASSERT contactBtns(c.mobile,'qmsWaCust',c.id)==='' and qmsTel10(c.mobile)==='' (no wa.me/tel link). 
G) Bridge tolerance: run the bridge tick (or call its customer-harvest path) with a blank-mobile QMS record present; ASSERT no exception thrown and saagar_master_customers contains {name:'Walk In Ravi',mobile:''} (or simply that harvest did not throw). 
H) Backward compat: seed a customers[] record WITHOUT a noMobile key, load(), ASSERT it renders and behaves as a normal mobile record (contactBtns render, dedupe applies).
- **Risk:** Low risk, additive. Only two functions get behavioural edits (renderEntry, addCustomer) plus one guard in confirmCloseLead; all changes are gated by the new checkbox/flag so the default (unchecked) path is byte-for-byte the current behaviour. No new libraries, no network calls (feature removes the only place a number would be needed). No storage-layer files touched. Main trap to avoid: do NOT add any field-whitelisting normalize on customers (would drop noMobile) — current code stores the raw array, so leave that intact. Re-encoding pitfall: use byte-exact re-encode of qms.html into index.html base64 (per harness-utf8 caution — do NOT round-trip the shell through PowerShell Get-Content/Set-Content, which mojibakes emoji); the module contains emoji (📞 📲) so verify the emoji bytes survive the re-encode. Confirm the QMS base64 in index.html decodes back to the edited file before considering done.

### P1-9 — Collected-revenue figure (month) from final amounts
- **Target:** V:/Co work/Projects/Retail/_extracted_modules/service.html  (source-of-truth for the base64-embedded module inside V:/Co work/Projects/Retail/saagar-control-centre/www/index.html — apply the edit to the module blob via the module_tool.js re-encode pipeline; do NOT hand-edit the base64 in index.html)
- **Additive-safe:** true
- **Approach:** Pure read-time aggregation over data already stored on closed cases (delivery.finalAmt). No new storage key, no record-shape change, no normalize/migrate. Two edits only, both in service.html:

1) MARKUP — add a 5th KPI tile to the dashboard stats grid.
   Region: the .stats-grid block at lines 1293-1310. Immediately AFTER the existing "Est. Revenue" gold card (the <div class="stat-card c-gold"> ending at line 1309), insert a new non-clickable tile:

     <div class="stat-card c-blue">
       <div class="stat-label">Collected (this month)</div>
       <div class="stat-value blue" id="st-cm">₹0</div>
     </div>

2) CSS — two tiny additive rules, add next to the existing colour rules (after line 165 `.stat-card.c-gold::before {...}` and after line 186 `.stat-value.gold {...}`):
     .stat-card.c-blue::before { background: var(--blue); }
     .stat-value.blue { font-size: 22px; color: var(--blue); }   /* --blue:#1d4ed8 already defined at line 14; matches the gold tile's reduced 22px so a ₹-with-thousands value fits */
   Also widen the desktop grid so 5 tiles sit on one row: change line 142
     grid-template-columns: repeat(4, 1fr);  ->  grid-template-columns: repeat(5, 1fr);
   The mobile media query (line 1145: `.stats-grid { grid-template-columns: 1fr 1fr; ... }`) is LEFT UNCHANGED — the 5th tile simply flows onto a 3rd row (5th tile alone), which is fine.

3) LOGIC — in renderDash() (starts line 2542). The existing line 2547 `const rev = DB.reduce((s, c) => s + parseFloat(c.estTotal || 0), 0);` stays untouched (it feeds the existing Est. Revenue tile — do NOT repurpose it). Add a NEW computation right after it and a NEW write right after the existing `st-rv` write (line 2553):

     // P1-9: money actually COLLECTED this calendar month = sum of delivery.finalAmt on CLOSED cases whose close/collect month is the current YYYY-MM.
     // Bucket by the YYYY-MM prefix of closedAt (present on every case closed by closeCase, and on all seeded closed cases); fall back to delivery.collectDate for any legacy/edge case that lacks closedAt. Slicing the ISO/date string avoids any timezone drift a new Date(...) would introduce.
     const nowYM = (function(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); })();
     const collectedMonth = closed.reduce((s, c) => {
       const d = c.delivery || {};
       const bucket = (c.closedAt || d.collectDate || '');   // 'YYYY-MM-DD...' either way
       if (String(bucket).slice(0,7) !== nowYM) return s;
       return s + parseRupee(d.finalAmt);                     // parseRupee handles blank/comma/'0.00' -> 0
     }, 0);
     const cmEl = document.getElementById('st-cm');
     if (cmEl) cmEl.textContent = '₹' + collectedMonth.toLocaleString('en-IN', { maximumFractionDigits: 0 });

   Notes: `closed` is already computed at line 2546 (`DB.filter(c => c.status === 'closed')`) — reuse it, do not re-filter. parseRupee is defined at line 2823 and is already the module's canonical rupee parser (strips commas/₹, returns 0 for blank/garbage). Guard the element write with `if (cmEl)` to match the module's defensive style. renderDash() is already re-invoked on every relevant mutation (close, save, delete, follow-up, filter — lines 2404/2490/2495/2503/2523/2616/2712/3378/3775/3902/3927/3932), so the tile stays live with no extra wiring.
- **Data model:** NO new localStorage key. NO new field. NO record-shape change. NO normalize/migrate helper touched (there is none in this module — DB is loaded raw as an array at line 2098-2101 and re-serialized by saveDB() at line 2374, so there is NO drop-on-normalize trap to worry about).

Reads only fields that already exist on closed cases in the existing key `saagar_wsf_v2` (STORE_KEY, line 2092):
 - c.status === 'closed' (already filtered into the `closed` array, line 2546)
 - c.closedAt  — ISO string, stamped by closeCase() at line 3361 on every close; also present on every seeded closed case (demo-seed.js line 234/595 = `<YYYY-MM-DD>T17:00:00.000Z`).
 - c.delivery.finalAmt — string, stamped/normalised at close (line 3339-3340 stores a clean numeric string); present on every seeded closed case.
 - c.delivery.collectDate — 'YYYY-MM-DD', used ONLY as a fallback bucket key when closedAt is somehow absent (a defensive path; seeded closed cases do NOT carry collectDate, so the closedAt path is what actually fires for the demo book).

Fallback/guard behaviour:
 - Old/legacy closed case with blank or missing finalAmt -> parseRupee returns 0 -> contributes nothing (no NaN).
 - Closed case with neither closedAt nor collectDate -> bucket === '' -> slice !== nowYM -> excluded (never mis-counted into the current month).
- **UI:** WHERE: The service module Dashboard, KPI stats grid (.stats-grid, currently 4 tiles: Total Cases / Open / Closed / Est. Revenue). A 5th tile "Collected (this month)" is appended after Est. Revenue.

APPEARANCE: Blue accent bar + blue value (reuses the module's existing --blue #1d4ed8 token), visually distinct from the gold "Est. Revenue" tile so the owner cannot confuse the two. Value uses the same en-IN thousands formatting and reduced 22px font as the gold tile.

CONTROLS: None — it is a read-only display tile (NOT clickable, no onclick, no role="button"/tabindex, so it is deliberately excluded from the setDashFilter tile-highlight loop at lines 2564-2567). This mirrors the existing non-interactive Est. Revenue card.

COPY:
 - Label: "Collected (this month)"  (uppercase-rendered by .stat-label text-transform; disambiguates from the estimate-based "Est. Revenue" which sums estTotal across ALL cases).
 - Value: "₹0" default in markup, replaced at render with e.g. "₹1,84,300".

RESPONSIVE: Desktop grid becomes repeat(5,1fr) so all five tiles sit in one row; mobile stays 2-up (unchanged media query) and the 5th tile flows to a new row on its own — acceptable and consistent with the existing 2-up behaviour.
- **Edge cases:** 1) Open cases: excluded — only the `closed` array is summed. An open case's delivery.finalAmt is typically '0.00'/blank and would parseRupee->0 anyway, but they are never even considered.
2) Blank/missing finalAmt on an old closed case: parseRupee('') === 0 -> no contribution, no NaN in the tile.
3) Comma-formatted legacy finalAmt (e.g. '1,200'): parseRupee strips the comma -> 1200 (this is exactly the svc-money-comma bug the close flow now normalises at line 3339; parseRupee also protects the read side).
4) closedAt is a UTC ISO string ('...T17:00:00.000Z'); collectDate is a local 'YYYY-MM-DD'. We deliberately .slice(0,7) the raw string instead of constructing a Date, so NO timezone conversion happens and the calendar month is taken verbatim from the stored date — deterministic, matches how the seed anchors dates and how todayStr()/other modules slice.
5) Case closed then re-opened/edited: closeCase is the only path that sets status:'closed' + closedAt, so a re-opened case (status back to 'open') drops out automatically; a re-closed case gets a fresh closedAt and lands in the correct month.
6) Month rollover: nowYM is recomputed on every renderDash() call, so the tile self-corrects when the calendar month changes (next render).
7) No closed cases this month: sum is 0 -> "₹0" (correct, not blank/undefined).
8) Very large book (seed has 500-1200 closed cases): one linear reduce over the already-in-memory `closed` array — negligible cost, runs inside the existing renderDash.
9) Element-missing safety: `if (cmEl)` guard means if the markup edit is somehow absent the logic is a no-op rather than a throw that would brick the dashboard.
- **Verify:** Seeded browser harness (index.html with demo-seed.js already run; STORE_KEY = 'saagar_wsf_v2'). Because the seed spreads closed cases across ~180 days with random finalAmt (ri(2,30)*100) and random dates, the exact monthly total is NOT a fixed constant — so verify by SELF-CONSISTENCY: recompute the expected value from the same DB with the same bucketing rule, then assert the rendered tile equals it.

Steps (run against the service module's iframe/window where DB and renderDash live; or replicate the read in the shell console against localStorage):

A) Presence + shape:
   - Confirm a 5th tile exists: document.getElementById('st-cm') is non-null and its label text is 'Collected (this month)'.
   - Confirm the existing 4 tiles (st-tot, st-op, st-cl, st-rv) still render and Est. Revenue (st-rv) value is UNCHANGED from before the edit (regression guard — the estTotal sum must not have been repurposed).

B) Correctness (deterministic recompute):
   const DB = JSON.parse(localStorage.getItem('saagar_wsf_v2')||'[]');
   const pr = v => { const n = parseFloat(String(v==null?'':v).replace(/[^0-9.\-]/g,'')); return isNaN(n)?0:n; };
   const d = new Date(); const ym = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
   const expected = DB.filter(c=>c.status==='closed').reduce((s,c)=>{ const del=c.delivery||{}; const b=(c.closedAt||del.collectDate||''); return String(b).slice(0,7)===ym ? s+pr(del.finalAmt) : s; },0);
   const shown = document.getElementById('st-cm').textContent.replace(/[^0-9]/g,'');
   ASSERT: Number(shown) === Math.round(expected).  // formatted (no decimals) match
   ASSERT: expected > 0 for the seeded book (there are ~85 closed cases in the current month, each ₹200-₹3000, so the current-month total is comfortably > 0).

C) Live-update / edge behaviour:
   - Open a case, close it with a Final Amount of e.g. 5000 dated today, return to dashboard: st-cm increases by 5000 (proves closeCase -> renderDash path and closedAt bucketing).
   - Manually inject a closed case with delivery.finalAmt blank and closedAt this month into DB, call renderDash(): st-cm does NOT change (blank-guard), no NaN in the tile.
   - Inject a closed case dated LAST month (closedAt = previous-month ISO): st-cm does NOT include it (month filter).

D) No-regression: confirm the dashboard still filters (click Open/Closed tiles), search still works, and no console error is thrown on renderDash — the new tile is non-clickable and must not appear in the tile-highlight loop.
- **Risk:** Risk: LOW. Additive read-only aggregation; touches one function (renderDash), adds one markup tile + 3 CSS lines. No storage writes, no new key, no bridge/report/whatsapp/shell changes, no library, no network. Cannot corrupt data (never writes DB). Worst case of a mistake is a wrong number on one display tile, contained to the service dashboard.
Watch-outs for the builder: (1) Do NOT reuse or mutate the existing `rev`/st-rv computation — the two tiles mean different things (estimate-of-all-cases vs collected-this-month). (2) Bucket by .slice(0,7) of the raw date string — do NOT use `new Date(closedAt).getMonth()`, which would shift a 'T17:00:00Z' seed date's month across the IST boundary for end-of-month closes. (3) Apply the change to _extracted_modules/service.html then re-encode into index.html via the established module blob pipeline (module_tool.js) — hand-editing base64 in index.html is prohibited. (4) Keep the mobile media query as-is; the 5th tile is meant to wrap on narrow screens.
OPTIONAL companion (explicitly OUT OF SCOPE for this item — the tile alone satisfies P1-9): a native-vector per-month "Collected" block in saagar-report.js. Not required; do not build unless separately requested.

### P1-11 — One-tap customer notify when stage becomes 'Ready for Pickup'
- **Target:** PRIMARY (required): V:/Co work/Projects/Retail/_extracted_modules/service.html — module code, base64-encoded inside V:/Co work/Projects/Retail/saagar-control-centre/www/index.html; edit the decoded module then re-encode into index.html via the module blob pipeline. SECONDARY (optional, 2 tiny plain-text edits): V:/Co work/Projects/Retail/saagar-control-centre/www/index.html — shell chrome, plain text.
- **Additive-safe:** true
- **Approach:** Add a small offer helper in the service module and call it from the two stage-write paths whenever the new stage becomes 'ready'. No new library, no storage change, offline-only (reuses the existing wa.me composer via postMessage).

STEP 1 — new helper in service.html (place immediately after quickStage(), i.e. after line 2505):
```
// P1-11: When a case reaches "Ready for Pickup", offer a one-tap WhatsApp to the
// customer using the shell's existing 'ready' template. Reuses waForCase()'s exact
// postMessage shape; the shell's ST_WA_SENT round-trip auto-logs the sent message
// into c.followUps via logWhatsAppFollowUp() — accountability captured for free.
// No storage change, no new key/field. Offline: shell opens the wa.me composer.
function offerReadyNotify(id) {
  const c = byId(id);
  if (!c || c.status === 'closed') return;                 // only open cases have a "Ready" moment
  const who = (c.custName || 'the customer').trim() || 'the customer';
  if (!confirm('Notify ' + who + ' on WhatsApp — "Ready for pickup"?')) return;
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'ST_WA', module: 'service', recordId: id, templateId: 'ready' }, '*');
      return;
    }
  } catch (e) {}
  toast('WhatsApp share opens from the app shell.');
}
```

STEP 2 — hook quickStage() (service.html:2498-2505). After the existing toast, add the offer when the NEW stage is 'ready'. The readOnlyGuard() at the top already blocks past-view writes, so the offer only fires on a live change:
```
function quickStage(id, stage) {
  if (readOnlyGuard()) return;
  const c = byId(id); if (!c) return;
  c.stage = STAGES[stage] ? stage : 'received';
  saveDB();
  renderDash();
  toast('Stage → ' + stageLabel(c.stage));
  if (c.stage === 'ready') offerReadyNotify(id);   // P1-11 one-tap notify offer
}
```

STEP 3 — hook the form stage-save path doSave() (service.html:3290-3325). Only offer when this save actually TRANSITIONED an existing case INTO 'ready' (guard against re-offering on every unrelated edit of an already-ready case). Capture the prior stage BEFORE the Object.assign, then offer after saveDB()/toast:
```
  const id = g('f-ono');
  const isNew = !editId;
  const _prevStage = (!isNew && byId(editId)) ? stageOf(byId(editId)) : null;   // P1-11: capture before overwrite
  ...
  saveDB();
  persistWatchPhoto(editId || id);
  toast('✓ Saved — ' + (editId || id));
  // P1-11: offer notify only on a real transition into "ready" (not on re-saving an already-ready case,
  // not on a brand-new case that starts ready). readForm() put the chosen stage on `data`.
  if (data.stage === 'ready' && _prevStage !== 'ready') offerReadyNotify(editId || id);
```
(Insert the `_prevStage` capture line right after `const isNew = !editId;` at line 3301, and the offer block right after the `toast('✓ Saved …')` at line 3318, BEFORE the `if (isNew) { …duplicate notice… }` block so the two setTimeout toasts don't collide with the confirm.)

STEP 4 (OPTIONAL — pre-select the 'ready' template so the composer opens already on it; skip entirely if not wanted, everything above works without it because 'ready' is the correct template for an open case and the user can pick it in one tap):
4a. Shell ST_WA handler, index.html:6677 — pass templateId through:
```
if(e.data.type === 'ST_WA') { try{ openWAComposer(e.data.module || activeModuleId, e.data.recordId, e.data.templateId); }catch(_){ } }
```
4b. openWAComposer signature/body, index.html:4607-4618 — accept + stash it:
```
function openWAComposer(presetId, recordId, templateId){
  ...
  __waPreselect = (recordId != null) ? recordId : null;
  __waPreTpl = templateId || null;      // P1-11 optional template pre-selection
  __waLocked = recordId != null;
  ...
```
Add `__waPreTpl` to the existing `let __waId = null, __waRecs = [], __waPreselect = null, …` declaration at index.html:4606 (initialise to null).
4c. waFillTpl(), index.html:4705-4712 — after building the option list, honor the requested template once (clear it so a manual module/record change doesn't re-force it):
```
  sel.innerHTML = tpls.length ? tpls.map(...).join('') : '<option value="">—</option>';
  if(__waPreTpl){ const has = tpls.some(t=>t.id===__waPreTpl); if(has) sel.value = __waPreTpl; __waPreTpl = null; }  // P1-11
  sel.onchange = waBuildPreview;
  waBuildPreview();
```
This is safe because the 'ready' template's ok:c=>c&&c.status!=='closed' passes for any open case, so it is always present in `tpls` for a case that just reached 'ready'.
- **Data model:** NO new localStorage keys and NO new record fields. This feature is a pure UI/postMessage hook — it reads existing case fields (c.custName, c.status, c.stage, c.id) and triggers the shell's existing composer. Nothing is written to storage by the new code paths.

CARRY / normalize concern: NONE for new data. The one persistence side-effect is the shell's existing ST_WA_SENT round-trip, which appends to c.followUps[] via the already-shipped logWhatsAppFollowUp() (service.html:3895-3904) using the exact same {type,datetime,remarks,outcome,dueDate,by,createdAt} shape already stored today — no schema change, and old cases are already handled by the `if(!Array.isArray(c.followUps)) c.followUps=[]` init. STORE_KEY 'saagar_wsf_v2' shape is untouched.

Optional shell edge adds one module-scoped JS variable __waPreTpl (in-memory only, NOT localStorage) — no persistence, no key.
- **UI:** Where it appears: no new buttons or DOM. The offer surfaces as a native confirm() dialog that fires the instant a case enters the 'ready' stage, from either write path:
 (1) the inline stage <select> on each case card (service.html:2671, onchange=quickStage) — the highest-traffic path, staff change 'where is the watch' straight from the list;
 (2) the edit form's Repair Stage select (#f-stage, service.html:1464-1468) on Save, when the case transitions into 'Ready for Pickup'.

Control + copy:
 - confirm() text: `Notify <CustomerName> on WhatsApp — "Ready for pickup"?` (falls back to `the customer` when custName is blank). OK → posts ST_WA and the shell opens its "Send on WhatsApp" composer already scoped to this case (recipient locked to the case, per __waLocked path) and, with the optional shell edge, pre-selected on the 'Ready for pickup' template with the message text pre-filled and editable. Cancel → nothing happens (stage change already persisted).
 - Composer copy is the EXISTING 'ready' template (index.html:4490): "Namaste <name>, Good news — your <item> (Service No: <id>) is ready for collection at Saagar Traders, Latur. Please visit at your convenience and carry this service number for a quick handover." (signed via waSign). No copy changes required.
 - After the user taps Share in the composer, the shell posts ST_WA_SENT back and the module auto-logs a WhatsApp follow-up on the case (existing behaviour) — visible in the case's Follow-Up Log.
- **Edge cases:** - Past-date / read-only view: quickStage() and doSave() both call readOnlyGuard() FIRST and return before any offer, so no notify is offered when viewing a historical date. offerReadyNotify() is only reachable after a successful live write.
- Closed/delivered case: offerReadyNotify() early-returns on c.status==='closed'. A delivered case can't meaningfully be "ready for pickup" again, and the 'ready' template's ok() would also exclude it. (quickStage can only set STAGES keys, which are all open-stage; a closed case's stage select is not the trigger.)
- Re-saving an already-'ready' case via the form: guarded by `_prevStage !== 'ready'` so editing other fields of a ready case does NOT re-nag. quickStage re-selecting 'ready' when already 'ready' WILL re-offer (acceptable: it is an explicit user action on that field, and mirrors how markEstimateApproved re-confirms; if stricter behaviour is wanted, capture prior stage in quickStage too — not required).
- Brand-new case created directly at 'ready': doSave() guard `!isNew` via `_prevStage` (null for new) means `_prevStage !== 'ready'` is true, so a new case saved straight to 'ready' DOES offer once — correct, that's a genuine ready moment.
- User taps Cancel on confirm(): stage change is already saved (offer is post-persist); no side effects.
- Desktop / no shell (window.parent === window): offerReadyNotify falls through to toast('WhatsApp share opens from the app shell.') exactly like waForCase() — no crash.
- Blank custName: copy falls back to "the customer" in the confirm; the template itself already tolerates empty name ('Namaste ,').
- Record outside the composer's capped 80-item list: WA_CFG.service.findRec(id) (index.html:4483) pulls the case in by id, so even an old case pre-selects correctly (existing __waPreselect path).
- Optional shell edge, template not applicable (e.g. somehow a closed case): `tpls.some(t=>t.id===__waPreTpl)` guard means an absent 'ready' option simply leaves the default selection — no error. __waPreTpl is cleared after one use so switching module/record in the composer doesn't re-force it.
- doSave ordering: place the offer BEFORE the existing `if(isNew){ setTimeout(...duplicate notice...) }` block so the duplicate-customer toast doesn't fire under the confirm modal.
- **Verify:** Seeded browser harness (module runs same-origin in the moduleFrame; the shell hosts WA_CFG + openWAComposer). Load the app with seeded demo data so saagar_wsf_v2 has open cases.

A. Static / decode checks:
 1. Decode the service module: confirm offerReadyNotify() exists once, quickStage() calls it under `if (c.stage === 'ready')`, and doSave() has the `_prevStage` capture + `data.stage === 'ready' && _prevStage !== 'ready'` guard. Confirm the postMessage payload is exactly `{ type:'ST_WA', module:'service', recordId:id, templateId:'ready' }`.
 2. Grep the DECODED module for `ST_WA` — must show waForCase() and the new offer; grep for any accidental new localStorage.setItem — must find NONE beyond the existing saveDB()/persistWatchPhoto.

B. Behavioural (in the running app, service module open):
 3. Instrument: in the shell page context set a spy — `window.__waCalls=[]; const _o=openWAComposer; openWAComposer=function(a,b,c){__waCalls.push([a,b,c]); return _o.apply(this,arguments);};` Also monkey-patch window.confirm to auto-return true for the test.
 4. In the module frame, call `quickStage('<openCaseId>','ready')`. EXPECT: DB case stage now 'ready' (read saagar_wsf_v2), a toast 'Stage → Ready for Pickup', and (confirm=true) `window.__waCalls` got one entry `['service','<openCaseId>','ready']`. Set confirm to false and repeat on another case: stage changes but __waCalls length unchanged.
 5. Call `quickStage('<openCaseId>','in_progress')` — EXPECT no new __waCalls entry (offer only on 'ready').
 6. Form path: open an existing open case in the form, set #f-stage to a non-ready value first, Save; then set #f-stage='ready' and call doSave(). EXPECT one __waCalls entry for that id with templateId 'ready'. Re-run doSave() without changing stage (still 'ready', edit another field) — EXPECT NO new __waCalls entry (the _prevStage guard).
 7. Past-view guard: set window.__stAsOf to a past date (isPastView true), call quickStage(id,'ready') — EXPECT readOnlyGuard blocks, no stage write, no __waCalls entry.

C. Composer + round-trip (optional shell edge):
 8. Let the real ST_WA fire (no spy). EXPECT the "Send on WhatsApp" modal opens, Recipient badge shows the correct case, and the Message select shows 'Ready for pickup' selected with the pickup text pre-filled in #waPreview (verify #waTpl.value==='ready').
 9. Click 'Share to WhatsApp' — EXPECT shell posts ST_WA_SENT back; then read saagar_wsf_v2 and confirm a new followUps[] entry of type 'WhatsApp', outcome 'Message sent' was appended to that case (logWhatsAppFollowUp round-trip). Confirms accountability logging.
 10. Regression: existing waForCase() from the Follow-Up Log still opens the composer with NO forced template (templateId undefined → __waPreTpl null → default first template), proving the optional edge doesn't hijack other entry points.
- **Risk:** Low risk. No storage writes added by the feature itself (pure UI + postMessage); the only persistence is the pre-existing ST_WA_SENT → logWhatsAppFollowUp path, whose shape is unchanged and already old-case-safe. No new library, no network — reuses the offline wa.me composer. HARD RULES respected: additive-only, no key rename, no record-shape change, storage-core.js/sqlite-store.js/photo-store.js untouched. Primary edits are confined to service.html (quickStage, doSave, one new helper); the optional shell edge is 3 tiny, guarded, backward-compatible lines in index.html (extra optional param + one in-memory var + a guarded pre-select) that leave every existing openWAComposer/waForCase caller behaving identically. Main behavioural watch-item is confirm-fatigue if quickStage re-offers on re-selecting an already-ready stage — acceptable and documented; a prior-stage guard in quickStage can be added if the owner finds it noisy. Remember to re-encode the edited service.html back into index.html's module blob (module code is base64 in the shell) and device-test the confirm() dialog on Android WebView.

### P1-42 — Repeat-customer recognition at QMS entry and Service intake
- **Target:** Two decoded modules, both re-encoded into www/index.html base64 blobs after editing. (1) QMS module id `retail_queue_management_v1`, decoded at V:/Co work/Projects/Retail/_extracted_modules/qms.html. (2) Service module id `saagar_wsf_v2`, decoded at V:/Co work/Projects/Retail/_extracted_modules/service.html. NO shell/bridge/report edits. Do NOT touch integration-bridge.js — it already writes the master; both edits are pure read-time consumers.
- **Additive-safe:** true
- **Approach:** Two independent, additive, read-only cross-frame lookups against the bridge-derived key `saagar_customer_master_v1` (structure `{version:1,byMobile:{ "<10digits>": {custId,mobile,names[],sources{}} }}`, written by integration-bridge.js:642-651). NEITHER edit writes to the master or changes any record shape — they only READ and set a form-field default the user can still override.

=== QMS EDIT (qms.html) ===
Function to touch: `showCustomerHistory()` at qms.html:540 (already wired to the Mobile field via `oninput="showCustomerHistory()"` on #custMobile, qms.html:539). Extend it — do NOT create a new hook.

Add two tiny local helpers near the top of the module (after line 394 where `const esc=` lives), because QMS has NO tryJSON/safeGet:
  `function _qmsNorm10(m){var d=String(m==null?'':m).replace(/\\D/g,'');return d.length>=10?d.slice(-10):'';}`
  `function _qmsMaster(){try{var ls=(window.parent&&window.parent!==window)?window.parent.localStorage:localStorage;var raw=ls.getItem('saagar_customer_master_v1');if(!raw)return null;var o=JSON.parse(raw);return (o&&o.byMobile)?o:null;}catch(e){return null;}}`
Rationale for cross-frame read: QMS runs in an iframe; the master lives in the SHELL's localStorage. Mirror the EXACT pattern qms.html:564 already uses to reach `window.parent.WA_CFG`. Guard with try/catch and fall back to same-frame `localStorage` so the harness (which may load qms.html top-level) still works.

Rewrite `showCustomerHistory()` to, after computing the existing same-blob `hist` list, ALSO:
  1. `var m10=_qmsNorm10(mobile);` — only proceed to the repeat banner when `m10` is a full 10 digits (`m10.length===10`).
  2. Read master: `var cm=_qmsMaster(); var me=cm&&cm.byMobile&&cm.byMobile[m10];`
  3. Compute local best-purchase from `state.customers` (the module's own recent blob) filtered to `c=>c.mobile===mobile && c.outcome==='Purchase'`, take the most recent by `closedAt||exitTime||entryTime`, read `purchaseCategory` (label; default 'Purchase') and `+purchaseAmount||0`. Count total past visits = `state.customers.filter(c=>c.mobile===mobile).length`. (The master has no purchase data — purchases come from state.customers, exactly as customer360Lookup sources them.)
  4. If `me` exists OR pastVisits>0: prepend a banner ABOVE the existing history list inside #historyBox: a `<div class="info-note">` reading `Repeat customer — N past visit(s)` plus, when a purchase exists, ` · last bought <Category> ₹<amount>`. Use `esc()` on the category. Example copy: `Repeat customer — 2 past visits · last bought Watch ₹12,500`. When no purchase found: `Repeat customer — 2 past visits`.
  5. Auto-preselect customer type ONLY if the user hasn't already changed it away from the default 'New': `var sel=$('customerType'); if(sel && sel.value==='New'){ sel.value='Repeat'; }`. Never overwrite a manual 'VIP'/'Repeat' choice. This runs on every oninput keystroke, so gate it on `m10.length===10` so it only fires once the full number is typed (not mid-typing) and only flips New→Repeat (idempotent).
Keep the existing empty-state and `hist.map` output intact — the banner is additive HTML prepended to `box.innerHTML`.

=== SERVICE EDIT (service.html) ===
Field: intake Full Name = #f-cn (service.html:1486), Mobile = #f-cm (service.html:1490). Add `onblur` to the mobile input (currently only `oninput=\"cpDebounced()\"`). Change to: `oninput=\"cpDebounced()\" onblur=\"svcAutofillFromMaster()\"`.

Add new function `svcAutofillFromMaster()` near the other helpers (service already has `mobileDigits` at :3287, `set` at :3162, `g` at :2817, `escapeHtml` at :2213, `toast` at :2391):
  ```
  function svcAutofillFromMaster(){
    try{
      var dm=mobileDigits(g('f-cm')); if(dm.length!==10) return;
      var cn=document.getElementById('f-cn'); if(cn && cn.value.trim()) return;   // never overwrite a typed name
      var ls=(window.parent&&window.parent!==window)?window.parent.localStorage:localStorage;
      var raw=ls.getItem('saagar_customer_master_v1'); if(!raw) return;
      var o=JSON.parse(raw); var e=o&&o.byMobile&&o.byMobile[dm];
      var nm=e&&e.names&&e.names[0]; if(nm){ set('f-cn', nm); toast('Autofilled name from customer records'); }
    }catch(err){}
  }
  ```
Only fills #f-cn when it is EMPTY and the master has a name. Purely a convenience default; the user can edit it. No write to master. Guarded try/catch + same-frame fallback (service already reaches window.parent for SaagarShare/SaagarReport/SaagarEvidence, so window.parent.localStorage is the established pattern).
- **Data model:** NO new localStorage keys. NO new record fields written anywhere. Both edits are strictly READ-only against the existing key `saagar_customer_master_v1` (owned/written solely by integration-bridge.js:642-651; structure `{version:1,updatedAt,byMobile:{"<10d>":{custId,mobile,names[≤6],sources{qms?:true,service?:true}}}}`).

No normalize/migrate CARRY is required for THIS feature because it writes no new fields — the classic drop-on-normalize trap does not apply. Two carry facts to KNOW (not to change): (a) QMS's `customerType` on a saved record is already an existing field written by addCustomer() (qms.html:542) and survives round-trips today; auto-preselecting 'Repeat' merely changes the DEFAULT of an existing field, so no new persistence path. (b) The service name written to #f-cn flows into the existing `custName` field via the existing save path (buildRecord/saveDB) — an existing field, no new key.

Master-shape defensiveness (mirror bridge + customer360Lookup): treat the key as possibly absent/malformed — guard `o && o.byMobile && o.byMobile[m10]`; `names` may be missing/empty (use `names[0]` only if truthy). norm10 must strip non-digits and take last 10 (`slice(-10)`), matching bridge's norm10 and shell's normMobile10 EXACTLY so a stored `+91`/spaced number keys the same bucket.
- **UI:** QMS: banner appears inside the existing 'Visit History' card body (#historyBox, qms.html:539), prepended above the per-visit history list, as a `<div class="info-note">` (class already used elsewhere in QMS, e.g. openCloseLead). It refreshes live on every keystroke of the Mobile field but only materializes once 10 digits are entered. Copy: `Repeat customer — {N} past visit{s} · last bought {Category} ₹{amount:en-IN}` (drop the ` · last bought…` clause when no prior Purchase exists). The Customer Type <select> (#customerType, options New/Repeat/VIP) silently flips from its default 'New' to 'Repeat' — no toast (avoid keystroke spam); the banner IS the visible signal. Manual VIP/Repeat selections are preserved.

Service: on blur of the Mobile field (#f-cm), if Full Name (#f-cn) is empty and the master has a name for that 10-digit mobile, the name is autofilled and a single brief toast fires: `Autofilled name from customer records`. If the user already typed a name, nothing happens (no overwrite, no toast).

No new buttons, tabs, colors, or layout. Both reuse existing classes and existing DOM nodes.
- **Edge cases:** 1. Master key absent (fresh install / bridge hasn't run): both helpers return null → no banner, no autofill, existing behavior unchanged. 2. Malformed JSON in the key: try/catch swallows → graceful no-op. 3. Mobile < 10 digits / mid-typing in QMS: gate on `m10.length===10`; banner and auto-Repeat do NOT fire until full number entered, so no flicker. 4. QMS user manually sets VIP or Repeat: auto-preselect only flips when current value==='New', so a manual choice is never clobbered; re-running on further keystrokes is idempotent (New→Repeat once). 5. Service name already typed: autofill is skipped (only fills empty #f-cn). 6. Cross-frame denied / harness loads module top-level (no parent frame): both fall back to same-frame `localStorage`, so the seeded harness still exercises the path. 7. Number stored in master as `+91XXXXXXXXXX` or with spaces: norm10 slice(-10) normalizes both sides to the same bucket. 8. Repeat customer with visits only in the ARCHIVE (pruned from the live blob past 45 days): the master `byMobile` entry still exists (bridge harvests it), so the 'Repeat customer' banner still shows via `me`; only the ₹ last-bought clause may be absent because state.customers no longer holds the old purchase — acceptable degradation (the banner correctly still flags Repeat). 9. Master has entry but empty `names[]`: service autofill no-ops (names[0] falsy); QMS banner still shows visit count. 10. Past-date/read-only QMS view: showCustomerHistory only renders; it sets a form default, never persists — safe (addCustomer already blocks writes on past dates). 11. Multiple names in master (up to 6): service uses names[0] (most-recent-first per bridge push order); acceptable.
- **Verify:** Seeded browser harness (load the shell so integration-bridge.js has populated `saagar_customer_master_v1`; or seed it manually).

Setup / seed check:
- In the shell page console: `JSON.parse(localStorage.getItem('saagar_customer_master_v1')).byMobile` — confirm at least one 10-digit key with `names[]`. If empty, seed one: `var cm={version:1,byMobile:{'9876543210':{custId:'c_9876543210',mobile:'9876543210',names:['Ravi Kumar'],sources:{qms:true}}}}; localStorage.setItem('saagar_customer_master_v1',JSON.stringify(cm));`
- Also ensure a QMS state.customers record exists for 9876543210 with `outcome:'Purchase', purchaseCategory:'Watch', purchaseAmount:12500` (via the QMS blob `retail_queue_management_v1`.customers) to exercise the last-bought clause.

QMS checks (open QMS module → Customer Entry view):
1. Type `9876543210` into Mobile (#custMobile). Assert #historyBox now contains an `.info-note` whose text starts `Repeat customer — ` and includes `last bought Watch ₹12,500`.
2. Assert `document.getElementById('customerType').value === 'Repeat'` (auto-flipped from New).
3. Manually set customerType to 'VIP', retype the last digit → assert value stays 'VIP' (not clobbered).
4. Type a never-seen number `9000000001` → assert NO repeat banner (only the existing empty/​history state), customerType stays 'New'.
5. Type only `98765` (5 digits) → assert no banner yet (gated on 10 digits).
6. Confirm `JSON.parse(localStorage.getItem('saagar_customer_master_v1'))` is BYTE-IDENTICAL before/after (lookup must not write). Snapshot the string pre/post and compare.

Service checks (open Service → new intake form):
7. Leave Full Name (#f-cn) empty, type `9876543210` into #f-cm, blur it (dispatch a blur event) → assert #f-cn.value === 'Ravi Kumar' and a toast fired.
8. Type a name first, then a known mobile, blur → assert #f-cn is NOT overwritten.
9. Blur with an unknown mobile → assert #f-cn stays empty, no error in console.
10. Confirm the master key string is unchanged after all service interactions (read-only).

Regression: create a normal QMS walk-in via addCustomer() and a normal service case via the save path → both save exactly as before (no schema change). Confirm no console errors when the master key is absent (delete it and repeat checks 4/9).
- **Risk:** Risk = med, driven entirely by the cross-frame read (iframe → parent localStorage). Mitigations baked into the spec: (a) every read wrapped in try/catch with a same-frame `localStorage` fallback, mirroring the proven `window.parent.WA_CFG` pattern already at qms.html:564 and service's existing `window.parent.SaagarShare/SaagarReport/SaagarEvidence` reaches; (b) STRICTLY read-only — the hard rule 'never write the QMS blob from a lookup' is honored: neither edit calls save()/saveDB()/setItem on the master; the only state changes are a form <select> default (QMS) and an empty text input (Service), both user-overridable and only persisted through the EXISTING save paths when the user actually saves the record; (c) auto-preselect is idempotent and gated (New→Repeat only, only at 10 digits) so repeated oninput firing cannot loop or fight the user. Base64 re-encode caution: after editing the decoded qms.html/service.html, re-encode into the correct www/index.html blob using the established byte-exact pipeline (module_tool.js) — do NOT round-trip the shell through PowerShell Get-Content/Set-Content (mojibake trap per memory). The QMS purchase field names were verified against confirmCloseLead (qms.html:557): `purchaseAmount`, `purchaseCategory`, `billNo`, `outcome`, `closedAt`, `exitTime`, `entryTime` all confirmed present. customer360Lookup (index.html:3363) is the working reference for the same master-read + norm10 + purchase-aggregation logic.

### P1-54 — Birthday/anniversary WhatsApp greeting list
- **Target:** Three files: (1) V:/Co work/Projects/Retail/_extracted_modules/qms.html — the DECODED QMS module (edits must be re-encoded back into the base64 blob inside V:/Co work/Projects/Retail/saagar-control-centre/www/index.html via the module blob pipeline). (2) V:/Co work/Projects/Retail/saagar-control-centre/www/integration-bridge.js — plain text. (3) V:/Co work/Projects/Retail/saagar-control-centre/www/index.html — plain-text shell region (Home card HTML + renderHome JS). NO edits to storage-core.js / sqlite-store.js / photo-store.js.
- **Additive-safe:** true
- **Approach:** Additive, three touch points, no schema renames.

TOUCH 1 — QMS walk-in form (qms.html):
a) FORM: in renderEntry() (qms.html line 539, the `New Walk-in` form-grid template string), add two OPTIONAL date fields after the `customerType` field (or anywhere inside the `.form-grid`):
   `<div class="field"><label class="label">Birthday (optional)</label><input class="input" id="custDob" type="date"></div>`
   `<div class="field"><label class="label">Anniversary (optional)</label><input class="input" id="custAnniv" type="date"></div>`
b) CAPTURE: in addCustomer() (qms.html line 542), the customer object literal currently ends `...priority:$('priority').value, purpose:$('purpose').value.trim(), status:'New Entry', ...`. Add two keys to that literal, reading the inputs and storing ONLY the MM-DD tail (year is irrelevant for a recurring greeting and keeping it whole is also fine — but MM-DD is smaller and matches the Home scan): 
   `dob:(($('custDob')&&$('custDob').value)||''),` and `anniv:(($('custAnniv')&&$('custAnniv').value)||''),`
   Store the raw ISO `YYYY-MM-DD` from the date input (do NOT strip year — the Home scan slices `.slice(5)` to get MM-DD; keeping the full ISO is harmless and future-proofs an age display). Empty string when not filled.
c) CLEAR: add `'custDob','custAnniv'` to the id list in clearEntryForm() (qms.html line 541) so a new entry starts blank.
NO change needed to QMS load()/save(): load() (line 422) does `state=JSON.parse(...)` wholesale and only defaults top-level arrays; save() (line 423) does `JSON.stringify(state)`. Customer records are persisted verbatim, so new customer fields survive read round-trips automatically — there is NO per-field normalize/normEntry in QMS that would drop them. This is the classic drop-trap and QMS is safe from it.

TOUCH 2 — Bridge carry onto the customer master (integration-bridge.js):
In reconcileMasters(), the derived customer-master builder (lines 642-651) has `touchCust(name,mobile,src)` which upserts `by[m10] = {custId,mobile,names:[],sources:{}}`. Extend it to CARRY dob/anniv so the Home card (which reads the master, not the QMS blob) has them:
 - Change the QMS harvest loop (line 649) to pass the whole customer: keep `touchCust(c.name,c.mobile,'qms')` but also, right after, copy dob/anniv when present. Simplest: widen touchCust signature to `touchCust(name,mobile,src,extra)` and at line 649 call `touchCust(c.name,c.mobile,'qms',{dob:c.dob,anniv:c.anniv})`; inside touchCust, after the sources block, add: `if(extra){ if(extra.dob && e.dob!==extra.dob){ e.dob=extra.dob; cmCh=true; } if(extra.anniv && e.anniv!==extra.anniv){ e.anniv=extra.anniv; cmCh=true; } }`. Only overwrite when the incoming value is truthy (never blank out an existing date), and flip cmCh so the master is re-saved. The Service harvest (line 650) passes no extra — fine (Service has no dob capture in scope). This is additive: entries without dob/anniv simply lack the keys.

TOUCH 3 — Home 'Greetings due today' card (index.html):
a) HTML host: insert a new card right after the Customer 360 card, i.e. after index.html line 1216 (`</div>` closing #cust360Card) and before line 1217 `</section>`:
   `<div class="section-head" id="greetHead"><h3>Greetings due today</h3></div>`
   `<div class="card card-pad" id="greetCard"><div id="greetList"></div></div>`
b) Render fn: add `function renderGreetings(){...}` near renderCustomer360 (index.html ~line 3390). It:
   - reads `const cm=tryJSON(safeGet(CUST_MASTER_KEY)); const by=(cm&&cm.byMobile)||{};`
   - computes today MM-DD: `const md=todayIso().slice(5);` (todayIso() = local date, line 2061)
   - scans entries: for each `m10` in by, entry e — if `e.dob && String(e.dob).slice(5)===md` push a birthday row; if `e.anniv && String(e.anniv).slice(5)===md` push an anniversary row. Row = {name:(e.names&&e.names[0])||'Customer', m10, kind:'Birthday'|'Anniversary'}.
   - if no rows: HIDE the card — `$('greetHead').style.display=$('greetCard').style.display='none';` (do not show an empty card on the 364 days nobody has a birthday). Else show both.
   - render each row reusing the EXACT wa.me pattern from renderCustomer360 (index.html line 3400/3415): `const waText=encodeURIComponent(kind==='Birthday'?('Namaste '+name+', wishing you a very happy birthday from Saagar Traders, Latur! 🎉'):('Namaste '+name+', warm wishes on your anniversary from Saagar Traders, Latur! 🎊'));` then a `.attn` row with a `<a class="btn tiny" href="https://wa.me/91${escapeHtml(m10)}?text=${waText}" target="_blank" rel="noopener">Wish on WhatsApp</a>` (and optionally a `tel:` Call button, matching line 3414). Use escapeHtml on name/m10.
c) Wire-up: call `try{ renderGreetings(); }catch(e){}` inside renderHome() (index.html line 3145), e.g. right before the `try{ renderEodCard(); }catch(e){}` line at 3269.
Uses only existing helpers (todayIso, tryJSON, safeGet, escapeHtml, CUST_MASTER_KEY) — no new libs, no network. wa.me deep links open the installed WhatsApp app (offline-first).
- **Data model:** NEW OPTIONAL FIELDS ONLY — no key renames, no shape changes to existing records.

1) QMS customer record (inside retail_queue_management_v1 → state.customers[] entries):
   - `dob`  : string, ISO 'YYYY-MM-DD' or '' (default ''). Set in addCustomer() from #custDob.
   - `anniv`: string, ISO 'YYYY-MM-DD' or '' (default ''). Set in addCustomer() from #custAnniv.
   CARRY: none needed inside QMS — load() (qms.html:422) does a wholesale JSON.parse into state and only defaults top-level arrays (state.customers=state.customers||[]); it never rebuilds customer objects field-by-field, and save() does JSON.stringify(state). So dob/anniv persist across every QMS read/write with no migrate step. Legacy/seeded customers simply lack the keys → read as undefined → treated as no-greeting.

2) Derived customer master (saagar_customer_master_v1 → byMobile[m10] entries), owned by the bridge:
   - existing shape: {custId, mobile, names:[], sources:{}} (integration-bridge.js:646).
   - ADD: `dob` (string ISO 'YYYY-MM-DD', optional) and `anniv` (string ISO, optional).
   CARRY: the bridge REBUILDS this index every cycle from the QMS/Service sources but PRESERVES the existing `cm` object each run (`var cm=L(CUST_MASTER,null)...` at line 643 — it loads, mutates, saves only on change). touchCust must copy dob/anniv from the source customer and only set them when the incoming value is truthy (never overwrite a good date with ''), flipping cmCh so the master re-saves. Because the bridge loads the prior master and only ADDS/UPDATES, previously-harvested dob/anniv are retained across cycles (no drop-on-rebuild). Entries harvested before this change simply have no dob/anniv until the customer's QMS record is next harvested.

No new top-level localStorage KEY is created — both fields live inside two EXISTING keys (retail_queue_management_v1, saagar_customer_master_v1). ADMIN_PIN/settings/etc untouched.
- **UI:** QMS Customer Entry form (Walk-in card): two new optional date pickers — 'Birthday (optional)' (#custDob) and 'Anniversary (optional)' (#custAnniv) — added to the existing .form-grid, styled by the module's existing .field/.label/.input classes. One tap to fill, left blank to skip (no validation, never blocks Save & Allocate).

Home dashboard: a new 'Greetings due today' section+card placed directly below the existing 'Customer lookup' (Customer 360) card. When one or more customers in the master have a birthday or anniversary whose MM-DD equals today, the card lists them — each row shows the customer name, a Birthday/Anniversary tag (🎉/🎊), the mobile, a 'Wish on WhatsApp' button (green, opens wa.me with a prefilled festive greeting) and optionally a 'Call' button (tel:). On the ~364 days with no matches the whole section+card is hidden (display:none) so Home stays clean. Copy: birthday text 'Namaste {name}, wishing you a very happy birthday from Saagar Traders, Latur! 🎉'; anniversary text 'Namaste {name}, warm wishes on your anniversary from Saagar Traders, Latur! 🎊' (owner store name is hardcoded to match the existing Customer 360 greeting at line 3400; a future pass could source it from ownerName()/org master).
- **Edge cases:** 1) Legacy/seeded customers have no dob/anniv → keys undefined → excluded from the scan (String(undefined).slice(5)!==md). No crash: guard with `if(e.dob && ...)`.
2) Blank date input → stored as '' → falsy → skipped. addCustomer must not store null/undefined that would break JSON — use `|| ''`.
3) Feb 29 birthdays: MM-DD '02-29' only fires in leap years. Acceptable for a greeting tool; do not special-case (documenting the known limitation). If desired, a later enhancement can roll to 02-28 in non-leap years, but that is OUT of scope.
4) Timezone: use todayIso() (local date, index.html:2061) NOT toISOString() (which is UTC and names the previous day 00:00–05:30 IST). Slicing .slice(5) on both the stored ISO and today's local ISO keeps the comparison timezone-consistent.
5) Same customer has BOTH a birthday AND anniversary today → two separate rows (one per occasion) — intended.
6) Master entry with dob but no names[] → name falls back to 'Customer'.
7) Non-10-digit or malformed mobile: master is keyed by norm10 m10 already (bridge only stores keys with a valid 10-digit mobile, line 645 `if(!m10) return`), so wa.me link is always well-formed.
8) escapeHtml on name (customer names can contain &, <, quotes) and on m10 before injecting into HTML/href — matches the Customer 360 code (lines 3410-3415). waText goes through encodeURIComponent.
9) Card must HIDE (not render empty) when zero greetings so Home is not cluttered; renderGreetings sets display:none on both #greetHead and #greetCard when the list is empty and restores '' when non-empty.
10) Bridge carry must NOT blank an existing date: only assign when the incoming extra.dob/extra.anniv is truthy, so re-harvesting an OLD QMS record (that predates the field) won't wipe a date captured on a newer visit.
11) Performance: the master byMobile is a modest map (one entry per unique mobile); a full scan on every renderHome is cheap. No pagination needed.
- **Verify:** Seeded browser harness = open V:/Co work/Projects/Retail/saagar-control-centre/www/index.html in a browser after demo-seed.js has populated localStorage (the standard seeded state). Then:

A) FIELD CAPTURE (QMS): open the QMS module (Walk-in), enter a 10-digit mobile + name, set Birthday and Anniversary date pickers to TODAY's month-day (any year), Save & Allocate. Then in devtools console:
   `JSON.parse(localStorage.retail_queue_management_v1).customers.slice(-1)[0]` → confirm the new record has non-empty `dob` and `anniv` ISO strings (round-trip survives: re-run and confirm they are still present after a page reload → proves no normalize drop).

B) BRIDGE CARRY: after the walk-in above, let the bridge cycle run (it fires on the storage event; or call `window.SaagarBridge && SaagarBridge.reconcile && SaagarBridge.reconcile()` if exposed, else reload Home which triggers a cycle). Then:
   `(function(){var cm=JSON.parse(localStorage.saagar_customer_master_v1);var m10=/* the mobile you entered, last 10 digits */; return cm.byMobile[m10];})()` → confirm the entry now has `dob` and `anniv` matching what you typed. Re-run the cycle and confirm they are NOT wiped (carry test).

C) HOME CARD (positive): with at least one master entry whose dob or anniv MM-DD === today, go Home and call `renderHome()` (or reload). Confirm a 'Greetings due today' card appears below Customer lookup, lists the customer with a 🎉/🎊 tag, and the 'Wish on WhatsApp' anchor href is exactly `https://wa.me/91<10digits>?text=<encoded greeting>` — verify by `document.querySelector('#greetList a.btn.tiny').href`. Clicking it should attempt to open WhatsApp (in a plain browser it opens web.whatsapp/wa.me — the deep link format is what matters).

D) HOME CARD (negative/empty): with NO master entry matching today (default seeded state has none, since seeded customers carry no dob/anniv), reload Home and confirm `getComputedStyle(document.getElementById('greetCard')).display === 'none'` and `#greetHead` is hidden — the card must NOT show empty.

E) NO REGRESSION: confirm Customer 360 lookup (#cust360Search) still works, renderHome throws no console error, and the QMS entry form still saves customers WITHOUT dob/anniv (leave both blank → Save → record has dob:'' anniv:'' and everything else normal).

F) MOJIBAKE/ENCODING: since qms.html edits must be re-encoded into index.html's base64 blob, after the blob update verify the emoji in the greeting copy (🎉🎊) render correctly in the running app (not as mojibake) — use byte-exact tooling for the shell file per the harness-utf8 caution; do NOT round-trip index.html through PowerShell Get-Content/Set-Content.
- **Risk:** Low risk, fully additive. Main pitfalls: (1) The QMS edit lands in the DECODED module file and MUST be re-encoded back into the base64 module blob inside index.html via the established module_tool blob pipeline — editing the decoded file alone has no effect on the running app. (2) Emoji in copy: keep the shell file byte-exact (harness-utf8 caution) to avoid mojibaking 🎉🎊 during re-encode. (3) Bridge carry must be guard-on-truthy so re-harvesting a pre-field record does not blank a captured date. (4) Use todayIso() not UTC. No storage-core touch, no new keys, no libs, no network (wa.me/tel: only). Existing record shapes unchanged; the two new fields are optional and default to ''. Effort S as scoped: field capture (form + object literal + clear list), a ~6-line bridge carry, one Home card + one small render fn wired into renderHome.

