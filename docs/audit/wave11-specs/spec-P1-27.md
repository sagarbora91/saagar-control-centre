# P1-27

SUMMARY: F&F settlement: new 'Full & Final Settlement' card in the payroll Letters tab that assembles final-month earnings (gmComputed: grossPayable + OT), statutory recoveries (PT/PF/ESIC), full advance outstanding (sum advOutstanding over advMatch vouchers), up to 4 manual +/- rows → net; persists a reprintable record under NEW sibling key payroll_fnf_v1 (sibling because loadState's embedded-seed override wipes in-state additions); PDF via NEW saagar-report.js BUILDERS.fnfSettlement using existing kv/table/netbox/note/sign blocks; no shell edit (ST_REPORT handler is generic).

NEW FIELDS: [
 {
  "field": "fnf record: {id, empId, name, designation, period, lastDay, earnings:[{label,amt}], recoveries:[{label,amt}], totEarn, totRec, net, netWords, ref, generatedAt, generatedBy, status:'final'}",
  "where": "NEW localStorage key payroll_fnf_v1 (JSON array, newest first)",
  "type": "array of objects",
  "default": "[] (fnfList() on-read normaliser returns [] on parse fail / non-array)",
  "carried_in": "n/a — sibling key with its own reader fnfList(); deliberately NOT inside payroll state because loadState() L1620 replaces state with the embedded seed whenever emb.rows.length>0 (demo builds would wipe it); precedent: ATT_FEED_KEY sibling key L3175"
 }
]

NEW KEYS: [
 "payroll_fnf_v1"
]

CROSS-FILE CONTRACT: payroll.html posts window.parent.postMessage({type:'ST_REPORT', reportType:'fnfSettlement', opts:{fnf:REC}},'*') (fallback window.SaagarReport.preview('fnfSettlement',{fnf:REC})); saagar-report.js BUILDERS.fnfSettlement(o) MUST read o.fnf with exactly the record shape above (numbers raw, un-formatted; builder formats via inr()) and return {orientation:'portrait', blocks:[...]}; also add META.fnfSettlement={title:'Payroll — Full & Final Settlement',scope:'monthly',icon:'🤝'}; do NOT add to _packTypes/forModule. Shell index.html L6729 ST_REPORT handler is generic — no shell edit.

SHARED REGIONS: [
 "www/saagar-report.js BUILDERS object (L96–909, insert new builder after hrLetter L563-574) — siblings P1-48/P1-26 may also append builders here",
 "www/saagar-report.js META object (L911-933) — siblings add entries too",
 "_extracted_modules/payroll.html Letters tab pane-hr markup + renderHr() L2727 — coordinate if a sibling item also extends the Letters tab"
]

# P1-27 — Payroll: Full & Final Settlement document

## Target
- `V:/Co work/Projects/Retail/_extracted_modules/payroll.html` (decoded payroll blob; re-embed via the established embed pipeline; NOTE the `<script id="app-data" type="application/json">` seed block false-fails naive JS syntax checks — lint only real script blocks):
  - `STORAGE_KEY="payroll_suite_v1_2026"` L1367; `stRealToday()` L1409; report invocation pattern L1482 & L2837 (`window.parent.postMessage({type:'ST_REPORT',reportType,opts},'*')` then `SaagarReport.preview` fallback).
  - `normalizeAdvance` L1598, `advMatch` L1696, `advOutstanding(v)` L1712, `advanceForRow` L1725, `gmComputed(row)` L1732 (locked-run snapshot else `calcGM`), `calcGM(row)` L1772 (returns `{...att, grossPayable, basic, hra, washing, specAllow, pt, pfWages, pfEE, esicEE, pfEmpr, esicEmpr, netPayable, otAmount, totalCTC, advance, finalPay}`).
  - `loadState()` L1617-1622 — **embedded-seed override**: if `emb.rows.length>0` the saved state is discarded and re-seeded ⇒ any F&F stored INSIDE `state` would be wiped in demo-seed builds → sibling key mandated.
  - Tabs: `BOTTOM_TABS` L1802, `switchTab(tab)` L1807, `renderActiveTab()` L1818 (`activeTab==="hr"` → `renderHr()`).
  - Wave-4 active-retire: `gmRows()` L1933, `activeGmRows()` L1938, `gmGlobalIdx(li)` L1939, Active checkbox in `renderMaster` L2136 (`row.active===false` = retired).
  - Letters tab: `HR_LETTERS` L2724, `renderHr()` L2727, `hrLetterData()` L2819, `hrExportPdf()` L2835. Helpers `slipEsc`, `slipINR` L2325, `slipWords` L2327, `fmtNiceDate` L2726.
- `V:/Co work/Projects/Retail/saagar-control-centre/www/saagar-report.js` (ACTIVE copy — repo root `saagar-control-centre`, updated 12-Jul; the `saagar-control-centre-demo` copy is stale): `BUILDERS` L96; `hrLetter` builder L563-574 (opts-passed-data precedent, like `advanceVoucher`); `META` L911-933; `buildModel` L1299; `window.SaagarReport` L1332. Engine block types handled by `renderDoc` switch (search `case 'kv':`): `header, spacer, pagebreak, para, attn, kpi, section, kv, statline, netbox, sign, note, empty, table`. `slipBlocks` (search `function slipBlocks`) is the exact precedent for the 4-column Earnings/Deductions table (`head/body/raw/money:[1,3]/colStyles/foot`) + `netbox` + `sign`.

## Additive-safe: TRUE
No existing key/field renamed or reshaped. One NEW optional localStorage key `payroll_fnf_v1` (array). No field added to `state`, rows, advances or runs ⇒ `normalizeRow`/`normalizeState`/`normalizeAdvance` untouched, zero drop-on-normalize exposure. No ledger mutation: advances, salary rows, runs and `active` flags are read-only inputs; the document assembles and records only. New report type is a new `BUILDERS`/`META` entry; shell ST_REPORT handler (index.html L6729) passes `reportType` through generically — **no shell edit, no bridge/EOD/buildExceptions item** (nothing in this feature emits hub exceptions).

## Approach
### A. payroll.html — F&F card in the Letters tab (`pane-hr`)
1. Markup: append a card below the existing HR-letter card inside `pane-hr`:
```html
<div class="card" id="fnf-card">
  <h3>🤝 Full &amp; Final Settlement</h3>
  <div class="hint">Assembles the final month's salary (current period: <span id="fnfPeriod"></span>), overtime, statutory deductions and the FULL advance outstanding for a retiring / retired employee. Generates a printable F&amp;F sheet and saves it for re-print. Does not change salary or advance data.</div>
  <label>Employee <select id="fnfEmp" onchange="renderFnfPreview()"></select></label>
  <label>Last working day <input type="date" id="fnfLastDay"></label>
  <div id="fnfAutoRows"></div>            <!-- read-only assembled lines -->
  <div id="fnfManualRows"></div>          <!-- up to 4 manual rows -->
  <button class="btn" id="fnfAddRow" onclick="fnfAddManual()">+ Adjustment row</button>
  <div class="net" id="fnfNet"></div>
  <button class="btn gold" onclick="fnfGenerate()">📄 Generate F&amp;F PDF</button>
  <div id="fnf-history"></div>            <!-- saved records, re-print buttons -->
</div>
```
2. Populate `fnfEmp` inside `renderHr()` (append; keep existing body intact): ALL `gmRows()` (a retired row is still in Master, just `active===false`); mark retired with suffix `" — retired"` using the same `gmGlobalIdx(li)` option-value pattern as L2729. If the chosen row has `active!==false`, show a non-blocking warning line: `"Note: this employee is still Active — F&F is normally for retiring staff. Untick Active in Employee Master when they exit."` (do NOT auto-retire).
3. Assembly (`fnfAssemble(gi)`):
```js
function fnfAdvOutstandingFor(row){let s=0;(state.advances||[]).forEach(a=>{if(advMatch(a,row))s+=advOutstanding(a);});return Math.round(s);}
function fnfAssemble(gi){
  const row=state.rows[gi]; if(!row) return null;
  const c=gmComputed(row);                       // locked month ⇒ frozen snapshot, draft ⇒ live calc
  const earnings=[{label:"Salary — "+state.meta.month+" "+state.meta.year+" ("+fmtLD(c.totalSalaryDays??c.finalPresent??0)+" salary days)",amt:Math.round(safeN(c.grossPayable))}];
  if(safeN(c.otAmount)>0) earnings.push({label:"Overtime ("+fmtOt(c)+")",amt:Math.round(c.otAmount)});
  const recoveries=[];
  if(safeN(c.pt)>0)     recoveries.push({label:"Professional Tax",amt:Math.round(c.pt)});
  if(safeN(c.pfEE)>0)   recoveries.push({label:"PF (Employee)",amt:Math.round(c.pfEE)});
  if(safeN(c.esicEE)>0) recoveries.push({label:"ESIC (Employee)",amt:Math.round(c.esicEE)});
  const advOut=fnfAdvOutstandingFor(row);
  if(advOut>0) recoveries.push({label:"Advance outstanding (all vouchers, full recovery)",amt:advOut});
  return {row,c,earnings,recoveries};
}
```
   **Do NOT use `c.advance`/`c.finalPay`** — `c.advance` is only THIS month's scheduled EMI; F&F recovers the FULL outstanding, and building from components (grossPayable/OT vs PT/PF/ESIC/advOut) avoids double-counting the month's EMI.
4. Manual rows: 4 fixed slots, each `label` text + `amount` number + `kind` select (`Addition`/`Deduction`); blank label or 0 amount ⇒ ignored. Additions append to `earnings`, deductions to `recoveries`. Net = `sum(earnings)-sum(recoveries)`; render live in `#fnfNet` as `₹ +slipINR(net)` (negative shown as `−₹ …  (recoverable from employee)`).
5. `fnfGenerate()`:
```js
function fnfList(){try{const v=localStorage.getItem("payroll_fnf_v1");const a=v?JSON.parse(v):[];return Array.isArray(a)?a:[];}catch(e){return [];}}
function fnfSave(rec){if(ST_READ_ONLY){stGuardWrite();return false;}try{const a=fnfList();a.unshift(rec);localStorage.setItem("payroll_fnf_v1",JSON.stringify(a));return true;}catch(e){toast("Could not save the F&F record.");return false;}}
function fnfGenerate(){
  const gi=Number(document.getElementById("fnfEmp").value); const A=fnfAssemble(gi);
  if(!A){toast("Select an employee first.");return;}
  if(!(A.c.totalDays>0)){toast("No computable salary for the current period (check total days / gross).");return;}
  const totEarn=A.earnings.reduce((s,x)=>s+x.amt,0), totRec=A.recoveries.reduce((s,x)=>s+x.amt,0), net=totEarn-totRec;
  const rec={id:"FNF"+Date.now(),empId:A.row.empId||"",name:A.row.name||"",designation:A.row.designation||"",
    period:state.meta.month+" "+state.meta.year,lastDay:document.getElementById("fnfLastDay").value||stRealToday(),
    earnings:A.earnings,recoveries:A.recoveries,totEarn,totRec,net,
    netWords:(typeof slipWords==="function")?slipWords(Math.abs(net)):String(net),
    ref:"GM/FNF/"+safeN(state.meta.year)+"/"+String(A.row.empId||A.row.name||"X").replace(/[^A-Za-z0-9]/g,"").slice(0,8).toUpperCase(),
    generatedAt:new Date().toISOString(),generatedBy:String(state.meta.signatory||"Owner"),status:"final"};
  fnfSave(rec);                                            // best-effort; PDF still opens when read-only-past blocks the save
  fnfOpenPdf(rec); renderFnfHistory();
}
function fnfOpenPdf(rec){
  if(window.parent&&window.parent!==window){window.parent.postMessage({type:'ST_REPORT',reportType:'fnfSettlement',opts:{fnf:rec}},'*');return;}
  if(window.SaagarReport&&window.SaagarReport.preview){window.SaagarReport.preview('fnfSettlement',{fnf:rec});return;}
  toast("Report engine unavailable on this build.");
}
```
6. History: `renderFnfHistory()` lists `fnfList()` (name · period · net · generatedAt via `fmtNiceDate` · by) with a `📄 Re-print` button per record calling `fnfOpenPdf(fnfList()[i])` — re-print uses the STORED numbers verbatim, never recomputes. Escape all interpolations with `slipEsc`. Call `renderFnfHistory()` + `fnfPeriod` fill from `renderHr()`.

### B. saagar-report.js — `fnfSettlement` builder (insert after `hrLetter`, i.e. after L574) + META entry (~L923)
```js
fnfSettlement: function (o) {
  var F = (o||{}).fnf || null;
  var hdr = { t: 'header', title: 'FULL & FINAL SETTLEMENT', sub: 'Saagar Traders · Latur', period: F ? (F.period || '') : '' };
  if (!F) return { orientation: 'portrait', blocks: [hdr, { t: 'empty', text: 'No settlement data — open Payroll → Letters → Full & Final Settlement.' }] };
  var blocks = [hdr];
  if (F.ref) blocks.push({ t: 'note', text: 'Ref: ' + F.ref + (F.generatedAt ? ' · Generated ' + String(F.generatedAt).slice(0,10) : '') + (F.generatedBy ? ' · By ' + F.generatedBy : '') });
  blocks.push({ t: 'kv', cols: 2, pairs: [
    ['Employee', F.name || '—'], ['Employee ID', F.empId || '—'],
    ['Designation', F.designation || '—'], ['Final Pay Period', F.period || '—'],
    ['Last Working Day', F.lastDay || '—'], ['Settlement Status', 'Full & Final'] ] });
  var E = Array.isArray(F.earnings)?F.earnings:[], R = Array.isArray(F.recoveries)?F.recoveries:[];
  var n = Math.max(E.length, R.length), body = [], raw = [];
  for (var i = 0; i < n; i++) { var e = E[i]||{}, r = R[i]||{};
    body.push([e.label?trunc(e.label,46):'', e.label?inr(e.amt):'', r.label?trunc(r.label,46):'', r.label?inr(r.amt):'']);
    raw.push([0, e.amt||0, 0, r.amt||0]); }
  blocks.push({ t: 'table', head: [['Earnings / Dues', 'Amount (₹)', 'Recoveries / Deductions', 'Amount (₹)']],
    body: body, raw: raw, money: [1, 3],
    colStyles: { 0:{cellWidth:'auto'}, 1:{cellWidth:96,halign:'right'}, 2:{cellWidth:'auto'}, 3:{cellWidth:96,halign:'right'} },
    foot: [['Total Dues', inr(F.totEarn), 'Total Recoveries', inr(F.totRec)]] });
  var neg = Number(F.net) < 0;
  blocks.push({ t: 'netbox', label: neg ? 'Net Recoverable from Employee' : 'Net Payable on Settlement', value: inr(Math.abs(Number(F.net)||0)) });
  blocks.push({ t: 'note', text: 'In words: Rupees ' + (F.netWords || '') + ' Only' + (neg ? ' (recoverable)' : '') + '.' });
  blocks.push({ t: 'para', text: 'This Full & Final Settlement is prepared in respect of the above employee upon cessation of employment with Saagar Traders, Latur. On acceptance of the net amount stated above, the employee confirms that no further dues remain payable by either party, save as required by law.' });
  blocks.push({ t: 'sign', boxes: [{ role: 'Employee (Received & Accepted)', name: F.name || '' }, { role: 'For Saagar Traders (Owner)', name: 'Authorised Signatory' }] });
  return { orientation: 'portrait', blocks: blocks };
},
```
META (append near L923): `fnfSettlement: { title: 'Payroll — Full & Final Settlement', scope: 'monthly', icon: '🤝' },` — deliberately NOT added to `_packTypes` (L~1504 in demo copy) or `forModule` so it never enters daily/monthly packs.

## Data model & CARRY analysis
- **NEW key `payroll_fnf_v1`** (array, newest-first). Record shape: `id` (string `FNF<ts>`), `empId`/`name`/`designation` (string, snapshot at generation), `period` (string), `lastDay` (YYYY-MM-DD), `earnings`/`recoveries` (arrays of `{label:string, amt:int}`), `totEarn`/`totRec`/`net` (int ₹), `netWords` (string), `ref` (string), `generatedAt` (ISO), `generatedBy` (string, `state.meta.signatory` fallback `'Owner'`), `status:'final'`. Justification for a SIBLING key rather than `state.fnf`: `loadState()` L1620 replaces the whole state with the embedded seed whenever `emb.rows.length>0` (demo-seed builds), which would silently wipe any in-state addition on every open — exactly the class of trap Wave 10's born-locked seed finding warned about. Precedent: `ATT_FEED_KEY="saagar_payroll_attendance_feed"` L3175 already uses a sibling key for payroll-adjacent data. On-read normaliser is the new `fnfList()` (returns `[]` on anything malformed) — no existing normaliser must carry anything.
- **No new fields** on `state`, rows, advances, runs, or any other module's data. `normalizeRow`/`normalizeState`/`normalizeAdvance` unchanged.

## UI (exact copy)
Letters tab (`pane-hr`), card title **"🤝 Full & Final Settlement"**; hint text as in the sketch (step A.1); active-employee warning copy as in step A.2; buttons **"+ Adjustment row"**, **"📄 Generate F&F PDF"**, **"📄 Re-print"**; toasts: `"Select an employee first."`, `"No computable salary for the current period (check total days / gross)."`, `"Could not save the F&F record."`, `"Report engine unavailable on this build."`. Net line shows `Net payable: ₹ <slipINR>` or `Net recoverable from employee: ₹ <slipINR>`.

## Edge cases
1. **Locked vs draft month** — `gmComputed` serves the frozen snapshot for a locked run, live `calcGM` otherwise; F&F reflects whichever period is selected in the sheet header. Show the current period in the hint so the owner picks the right month first.
2. **This month's advance EMI vs full outstanding** — assembled from components (never `finalPay`), so the EMI already inside `finalPay` is never double-counted; the single "Advance outstanding" line = `Σ advOutstanding(v)` over `advMatch` vouchers (recovered-in-locked-runs already netted by `advRecoveredTotal`).
3. **Legacy manual `row.advance`** — NOT auto-included (it is a per-month manual deduction, not a voucher balance); the owner can add it as a manual Deduction row.
4. **Negative net** (recoveries > earnings) — netbox label flips to "Net Recoverable from Employee", value shown as absolute, note marked "(recoverable)".
5. **No computable salary** (`totalDays<=0` or gross 0) — generation blocked with toast; owner can still proceed by zeroing via a draft month with figures, or use manual rows only after entering gross.
6. **Active employee selected** — warning shown, generation still allowed (settlements are often prepared before the Master toggle is flipped); nothing auto-retires (`row.active` never written).
7. **Retired employee** — `gmRows()` still contains the row (only `activeGmRows()` excludes it), so selection works; slips/pay-run remain unaffected.
8. **READ-ONLY-PAST** (`ST_READ_ONLY`) — `fnfSave` blocks the localStorage write via `stGuardWrite()` but the PDF still opens (document generation is a read).
9. **Re-print fidelity** — history re-print passes the stored record verbatim; later salary/advance edits never alter an issued F&F.
10. **Corrupt `payroll_fnf_v1`** — `fnfList()` returns `[]`; a subsequent save rebuilds the array (accepting loss of corrupt data, matching module-wide precedent).
11. **>4 manual rows** — "+ Adjustment row" disabled after 4 (`fnfAddManual` no-ops with toast `"Up to 4 adjustment rows."`).
12. **XSS** — every user string rendered in-module via `slipEsc`; the engine escapes internally (`esc()`; autotable cells are text).
13. **Uneven earnings/recoveries lists** — builder pads the shorter side with blank cells (loop over `max(E,R)`), `raw` zero-filled so money-carry math stays exact.

## Verify (browser harness, module iframe = payroll; tab switcher is `switchTab(tab)` — drive `switchTab('hr')`)
All via `moduleFrame.contentWindow.eval(...)`:
1. `switchTab('hr'); !!document.getElementById('fnf-card')` → true; `fnfEmp` option count === `gmRows().length`.
2. Seeded retired employee (Master → untick Active): option text ends `" — retired"`; selecting an ACTIVE row shows the warning line.
3. `const A=fnfAssemble(gmGlobalIdx(0)); A.earnings[0].amt===Math.round(gmComputed(state.rows[gmGlobalIdx(0)]).grossPayable)` → true; with a voucher of ₹10,000 EMI ₹2,000 and one locked prior run recovering 2,000, the Advance-outstanding line === 8,000 (`fnfAdvOutstandingFor` === `Σ advOutstanding`).
4. `fnfGenerate()` (employee selected): `JSON.parse(localStorage.getItem('payroll_fnf_v1')).length===1` and record has `net===totEarn-totRec`, `generatedAt`, `generatedBy`, `ref` matching `/^GM\/FNF\//`.
5. Manual row round-trip: add Deduction "Uniform recovery" 500 → net drops by 500 in `#fnfNet` and in the saved record.
6. Re-print: mutate `state.rows[gi].gross` after generation, click Re-print → posted `opts.fnf.totEarn` unchanged (spy `window.parent.postMessage` or check `fnfList()[0]` passed by reference-equality of stored numbers).
7. Engine (top window): `SaagarReport.build('fnfSettlement',{fnf:<record>})` resolves to a Blob; `buildModel('fnfSettlement',{})` returns the empty-state blocks (no throw); `buildModel('fnfSettlement',{fnf:{net:-1200,netWords:'One Thousand Two Hundred',earnings:[],recoveries:[{label:'Advance outstanding',amt:1200}],totEarn:0,totRec:1200}})` netbox label === 'Net Recoverable from Employee'.
8. Corrupt-key: `localStorage.setItem('payroll_fnf_v1','{oops')` → `fnfList()` returns `[]`, tab renders without console errors.
9. Regression: attendance/gm/slips tabs render clean; `normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)))` output identical pre/post-feature (no state shape change); 0 console errors across all 9 tabs.

## Risk & blast radius
LOW. Payroll blob: additive UI in `pane-hr` + new functions only; the single shared touch-point is appending to `renderHr()` (keep existing lines intact). No writes to `state`, advances, runs, or `active`; the only new write is the sibling key. saagar-report.js: one builder + one META entry — inert for all existing report types; not in packs, so Reports Centre packs and `forModule` routing unchanged. No bridge/EOD surface (no buildExceptions item, no EXC_AREA mapping, no close-day step interaction). Shell untouched (generic ST_REPORT handler L6729 confirmed). Failure mode worst-case: a malformed F&F record renders a wrong PDF — it never feeds salary, tax, or bridge readers (`mirrorRowOutputs` fields untouched). Collision watch: siblings P1-48/P1-26 also append to `BUILDERS`/`META` — merge as independent additions (comma-separated entries, no shared lines).