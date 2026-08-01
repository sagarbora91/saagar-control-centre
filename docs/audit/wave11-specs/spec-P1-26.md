# P1-26

SUMMARY: Member-wise statutory register: new reportStatutoryMemberCsv() in payroll.html (one CSV row per employee — UAN/PF wages/PF EE+ER, ESIC IP/wages/EE+ER, PT — built from the existing payTotals() rows, all fields already computed by calcGM and frozen in lock snapshots) plus a new landscape 'statutoryRegister' builder in www/saagar-report.js mirroring payrollRegister, fed live via the existing ST_REPORT postMessage path (no shell edit needed — ST_REPORT routing at index.html L6729 is reportType-agnostic). Zero new stored fields, zero new localStorage keys, no normaliser impact.

NEW FIELDS: []

NEW KEYS: []

CROSS-FILE CONTRACT: payroll.html openEngineReport gains kind==='statutoryRegister' posting {type:'ST_REPORT',reportType:'statutoryRegister',opts} where opts = { period:string, locked:boolean, preparedBy:string, approvedBy:string, rows:[{sr:number, uan:string, name:string, empId:string, pfWages:number, pfEE:number, pfER:number, esicIp:string, esicWages:number, esicEE:number, esicER:number, pt:number, gross:number}], totals:{pfWages,pfEE,pfER,esicWages,esicEE,esicER,pt,gross,emp} } — consumed verbatim by the new BUILDERS.statutoryRegister(o) in www/saagar-report.js (live-opts-only, empty-state fallback when o.rows is absent, exactly like statutorySummary).

SHARED REGIONS: [
 "payroll.html Reports tab markup L1166-1171 (Statutory Summary card — this item adds buttons here; any sibling touching the Reports tab collides)",
 "payroll.html L3115-3133 report-function block (reportBankCsv/reportStatutoryCsv/reportStatutoryPdf — new functions inserted after L3133)",
 "payroll.html openEngineReport() L1465-1486 (adds a third kind branch)",
 "saagar-report.js BUILDERS map (new builder after statutorySummary ~L494) and META map ~L919-921 (new entry) — shared with any sibling adding a saagar-report.js builder (P1-48/P1-27)"
]

# P1-26 — Payroll: member-wise statutory register (filing-ready CSV + PDF)

## Target
- `V:/Co work/Projects/Retail/_extracted_modules/payroll.html`
  - Reports tab "Statutory Summary" card markup **L1166–1171** (add 2 buttons, retitle copy)
  - `openEngineReport(kind)` **L1465–1486** (add `statutoryRegister` branch)
  - report functions block: `reportBankCsv` **L3115–3123**, `reportStatutoryCsv` **L3124–3131**, `reportStatutoryPdf` **L3133** → insert `reportStatutoryMemberCsv()` + `reportStatutoryMemberPdf()` after L3133
  - data sources (read-only, verified): `payTotals()` **L2861–2867** returns `{rows:[{row,c}],T}` with `T={emp,gross,ded,adv,net,pt,pfEE,pfER,esEE,esER}`; `calcGM(row)` **L1772–1799** returns per-row `c` incl. `pfWages,pfEE,pfEmpr,esicEE,esicEmpr,pt,grossPayable,washing` (NOTE: employer fields are **pfEmpr/esicEmpr**, not pfER/esicER; there is NO esicWages field — derive it as `grossPayable − washing` when ESIC applies, see L1778/L1790–1792); row master fields `uan`, `esicIp` exist (L1570, L2128); `gmComputed(row)` **L1732–1739** serves the frozen lock snapshot (a stored `calcGM` output, so `washing`/`pfWages` are present in snapshots too); `repPeriod()` L3112; `appSaveBlob` L2257.
- `V:/Co work/Projects/Retail/saagar-control-centre/www/saagar-report.js` (canonical repo = `saagar-control-centre`, HEAD 5c9b71b; the `_extracted_modules` payroll.html re-embeds into its shell)
  - `BUILDERS` map: mirror `payrollRegister` (**L385–430** structure) + `statutorySummary` (**L464–494** live-opts-only pattern); insert new `statutoryRegister` builder after L494
  - `META` map **L919–921**: add one entry after `statutorySummary`
  - NO shell `index.html` edit: ST_REPORT routing (index.html **L6729**) forwards any `reportType` to `SaagarReport.preview` — type-agnostic.

## Additive-safe — TRUE
No new stored fields, no new localStorage keys, no writes at all — both exports are pure reads of `payTotals()` (which already honors lock snapshots via `gmComputed`). Payroll's on-read normaliser is untouched; the drop-on-normalize trap does not apply. New saagar-report.js builder + META entry are additive map entries. Not an exceptions item → EXC_AREA_TO_MODULE / buildCloseDaySteps irrelevant.

## Approach
**Step 1 — shared row extractor (payroll.html, insert after L3133).** One helper feeding both CSV and PDF so they can never diverge:
```js
// P1-26: member-wise statutory rows — one row per employee, filing-ready for PF ECR / ESIC upload.
// esicWages is derived (grossPayable − washing, the exact base at calcGM L1778) because calcGM
// does not return it; zeroed when ESIC did not apply (both sides 0).
function statutoryMemberRows(){
  const {rows,T}=payTotals();
  const out=rows.map((x,i)=>{const r=x.row,c=x.c;
    const esicOn=(safeN(c.esicEE)>0||safeN(c.esicEmpr)>0);
    return { sr:i+1, uan:String(r.uan||""), name:String(r.name||""), empId:String(r.empId||""),
      pfWages:Math.round(c.pfWages||0), pfEE:Math.round(c.pfEE||0), pfER:Math.round(c.pfEmpr||0),
      esicIp:String(r.esicIp||""), esicWages:esicOn?Math.round(safeN(c.grossPayable)-safeN(c.washing)):0,
      esicEE:Math.round(c.esicEE||0), esicER:Math.round(c.esicEmpr||0),
      pt:Math.round(c.pt||0), gross:Math.round(safeN(c.grossPayable)) };});
  const tot={ emp:out.length, pfWages:out.reduce((s,r)=>s+r.pfWages,0), pfEE:Math.round(T.pfEE), pfER:Math.round(T.pfER),
    esicWages:out.reduce((s,r)=>s+r.esicWages,0), esicEE:Math.round(T.esEE), esicER:Math.round(T.esER),
    pt:Math.round(T.pt), gross:out.reduce((s,r)=>s+r.gross,0) };
  return {list:out,tot};
}
```
Whole-rupee `Math.round` matches the existing `reportStatutoryCsv` convention (L3127–3129) and PF-ECR/ESIC portals (integer amounts).

**Step 2 — member-wise CSV.** Column order front-loads the PF-ECR keying sequence (UAN, name, gross, EPF wages, EE, ER) then ESIC then PT — plain labelled CSV, deliberately NOT the `#~#` ECR fixed format:
```js
function reportStatutoryMemberCsv(){
  const {list,tot}=statutoryMemberRows();
  if(!list.length){toast("No employees.");return;}
  const q=v=>'"'+String(v).replace(/"/g,'""')+'"';
  let csv="Sr,UAN,Employee Name,Emp ID,Gross Payable,PF Wages,PF EE,PF ER,ESIC IP No,ESIC Wages,ESIC EE,ESIC ER,PT\n";
  list.forEach(r=>{ csv+=[r.sr,"'"+r.uan,q(r.name),q(r.empId),r.gross,r.pfWages,r.pfEE,r.pfER,"'"+r.esicIp,r.esicWages,r.esicEE,r.esicER,r.pt].join(",")+"\n"; });
  csv+=["TOTAL ("+tot.emp+")","","","",tot.gross,tot.pfWages,tot.pfEE,tot.pfER,"",tot.esicWages,tot.esicEE,tot.esicER,tot.pt].join(",")+"\n";
  appSaveBlob(new Blob([csv],{type:"text/csv"}),"StatutoryRegister_"+repPeriod().replace(/[^A-Za-z0-9]+/g,"_")+".csv");
}
function reportStatutoryMemberPdf(){ openEngineReport('statutoryRegister'); }
```
The leading-apostrophe guard on UAN/ESIC-IP is the exact `reportBankCsv` accountNo convention (L3121) — stops Excel mangling 12-digit numbers into scientific notation.

**Step 3 — `openEngineReport` branch (L1471–1481).** Convert the `if/else` into `if(kind==='statutorySummary'){…}else if(kind==='statutoryRegister'){…}else{ // payrollRegister …}`:
```js
}else if(kind==='statutoryRegister'){
  const sm=statutoryMemberRows();
  opts={ period:repPeriod(), locked:locked, preparedBy:m.preparedBy||"", approvedBy:m.signatory||"Authorised Signatory",
    rows:sm.list, totals:sm.tot };
}
```
The existing tail (L1482–1484) already posts `{type:'ST_REPORT',reportType:kind,opts}` to the parent or calls `SaagarReport.preview(kind,opts)` standalone — unchanged.

**Step 4 — saagar-report.js builder** (insert after `statutorySummary` closes at L494; META entry after L921):
```js
/* ===== PAYROLL — STATUTORY REGISTER, MEMBER-WISE (landscape) — Wave 11 P1-26 =====
   Live-opts-only like statutorySummary: employer PF/ESIC and UAN-joined figures are computed in
   the payroll module and passed via opts.rows; no localStorage fallback is possible. */
statutoryRegister: function (o) {
  o = o || {};
  var hdr = { t: 'header', title: 'STATUTORY REGISTER — MEMBER-WISE', sub: 'Saagar Traders · Latur', period: o.period || '',
    chip: o.locked ? 'LOCKED — FINAL' : 'DRAFT', chipKind: o.locked ? 'locked' : 'draft' };
  if (!Array.isArray(o.rows) || !o.rows.length)
    return { orientation: 'landscape', blocks: [hdr, { t: 'empty', text: 'Open the Payroll module → Reports tab to generate the member-wise statutory register.' }] };
  var T = o.totals || {}, body = [], raw = [];
  o.rows.forEach(function (r, i) {
    body.push([String(i + 1), r.uan || '—', trunc(r.name || '—', 20), inr(r.pfWages), inr(r.pfEE), inr(r.pfER),
      r.esicIp || '—', inr(r.esicWages), inr(r.esicEE), inr(r.esicER), inr(r.pt)]);
    raw.push([0, 0, 0, Number(r.pfWages) || 0, Number(r.pfEE) || 0, Number(r.pfER) || 0, 0,
      Number(r.esicWages) || 0, Number(r.esicEE) || 0, Number(r.esicER) || 0, Number(r.pt) || 0]);
  });
  var blocks = [hdr];
  blocks.push({ t: 'kpi', cols: 4, items: [
    { label: 'Employees', value: num(o.rows.length) },
    { label: 'PF (EE + ER)', value: inr((Number(T.pfEE) || 0) + (Number(T.pfER) || 0)) },
    { label: 'ESIC (EE + ER)', value: inr((Number(T.esicEE) || 0) + (Number(T.esicER) || 0)) },
    { label: 'Prof. Tax', value: inr(Number(T.pt) || 0), hero: true } ] });
  blocks.push({ t: 'table',
    head: [['Sr', 'UAN', 'Employee', 'PF Wages', 'PF EE', 'PF ER', 'ESIC IP No', 'ESIC Wages', 'ESIC EE', 'ESIC ER', 'PT']],
    body: body, raw: raw, money: [3, 4, 5, 7, 8, 9, 10],
    colStyles: { 0: { cellWidth: 24, halign: 'center' }, 1: { cellWidth: 84 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 62, halign: 'right' }, 4: { cellWidth: 54, halign: 'right' }, 5: { cellWidth: 54, halign: 'right' }, 6: { cellWidth: 84 }, 7: { cellWidth: 66, halign: 'right' }, 8: { cellWidth: 56, halign: 'right' }, 9: { cellWidth: 56, halign: 'right' }, 10: { cellWidth: 50, halign: 'right' } },
    foot: [['', '', 'TOTAL (' + o.rows.length + ')', inr(T.pfWages), inr(T.pfEE), inr(T.pfER), '', inr(T.esicWages), inr(T.esicEE), inr(T.esicER), inr(T.pt)]] });
  blocks.push({ t: 'note', text: 'PF columns follow the ECR keying order (UAN → wages → EE → ER). Missing UAN / ESIC IP numbers print as "—" — fill them in Employee Master before filing.' });
  blocks.push({ t: 'sign', boxes: [{ role: 'Prepared By', name: o.preparedBy || '—' }, { role: 'For Saagar Traders', name: o.approvedBy || 'Authorised Signatory' }] });
  return { orientation: 'landscape', blocks: blocks };
},
```
META (after L921): `statutoryRegister: { title: 'Payroll — Statutory Register (Member-wise)', scope: 'monthly', icon: '🏛️' },` — needed for the preview title (L1392) and history log (L1580+). Do **NOT** add to `_packTypes` (L1504) or the hub `GROUPS`/`TAGS` (L1598–1613): like `statutorySummary`, it is live-opts-only and would render its empty-state from the shell hub; `statutorySummary` itself is deliberately absent from both — mirror that.

## Data model & CARRY analysis
- **New localStorage keys: none.** **New stored fields: none.** Both exports read `payTotals()` at click time.
- Payroll's row normaliser (the row-mapping at L1570 that stringifies `uan`/`esicIp` etc.) already carries every field consumed here — nothing to add. Lock snapshots (`gmComputed` L1732) store full `calcGM` outputs, so `pfWages`/`washing`/`pfEmpr`/`esicEmpr` are present for locked months; `safeN(...||0)` guards cover any pre-feature snapshot theoretically missing a field.
- Derived-only value: `esicWages = grossPayable − washing` (the exact `esicBase` of calcGM L1778), zeroed when both ESIC sides are 0.

## UI
Reports tab card, **L1166–1171**. Replace the card body with:
```html
<h3 style="margin:0 0 6px;color:var(--navy);font-size:14px">Statutory — Summary &amp; Register</h3>
<p style="font-size:12px;color:var(--g600);margin:0 0 12px">Totals for remittance, plus a member-wise register (UAN, PF, ESIC IP, PT per employee) for PF ECR &amp; ESIC monthly uploads.</p>
<button class="btn primary" onclick="reportStatutoryPdf()">📄 Summary PDF</button>
<button class="btn" style="margin-left:8px" onclick="reportStatutoryCsv()">Summary CSV</button>
<div style="margin-top:8px">
  <button class="btn primary" onclick="reportStatutoryMemberPdf()">📄 Member-wise PDF</button>
  <button class="btn" style="margin-left:8px" onclick="reportStatutoryMemberCsv()">Member-wise CSV</button>
</div>
```
Existing buttons/handlers keep their exact onclicks — only copy and two added buttons.

## Edge cases
1. **No employees** → CSV path toasts "No employees." (existing `openEngineReport` L1468 already toasts for the PDF path); builder also has an empty-state block.
2. **Missing UAN / ESIC IP** → empty string in CSV (accountant fills), '—' in PDF + explicit note; never invent numbers.
3. **PF or ESIC not applicable for a row** (`pfApplicable`/`esicApplicable` off, or gross above the ₹21k ceiling, L1785/L1790) → calcGM already zeroes wages+both sides; row still prints (register must list every employee) with 0s.
4. **Locked month** → `gmComputed` serves the frozen snapshot; register matches the locked register PDF to the rupee; chip shows LOCKED — FINAL.
5. **Excel scientific-notation mangling of 12-digit UAN / 10-digit ESIC IP** → leading-apostrophe guard (reportBankCsv convention L3121).
6. **Commas/quotes in names or Emp IDs** → `q()` CSV-quoting (same escape as L3120).
7. **Standalone module (no parent frame)** → `openEngineReport` L1483 falls back to direct `SaagarReport.preview`; if the engine is absent it toasts "Report engine unavailable on this build."
8. **Shell Reports hub calls the new type with no opts** (possible only via history re-open) → builder returns the "Open the Payroll module…" empty state — same contract as `statutorySummary` L469.
9. **Rounding drift vs the 3-row summary CSV** → both round the same `payTotals()` T totals with `Math.round`; footer uses T-based totals (not re-summed rounded rows) for PF EE/ER, ESIC EE/ER, PT — matching `reportStatutoryCsv` exactly. Per-row rounded values may differ from the footer by a few rupees total; this is standard for statutory registers and matches the existing summary; do NOT "fix" by re-summing.
10. **Feb PT / gender-exempt rows** → `c.pt` per row already encodes slab + Feb ₹300 (ptFor L1770/L1783); no re-derivation.

## Verify (browser harness, module iframe = payroll; tab switcher is `switchTab(tab)` at payroll.html L1807)
Via `moduleFrame.contentWindow.eval(...)`:
1. `typeof reportStatutoryMemberCsv==='function' && typeof reportStatutoryMemberPdf==='function' && typeof statutoryMemberRows==='function'`
2. `switchTab('reports')` then assert the card contains both new buttons: `document.body.innerHTML.includes('Member-wise CSV') && document.body.innerHTML.includes('reportStatutoryMemberPdf')`
3. Row math: `(function(){const s=statutoryMemberRows(),{T}=payTotals();return s.list.length===T.emp && s.tot.pfEE===Math.round(T.pfEE) && s.tot.esicER===Math.round(T.esER) && s.list.every(r=>r.esicWages===0? (r.esicEE===0&&r.esicER===0):true);})()`
4. CSV capture: temporarily stub `appSaveBlob` inside the frame, call `reportStatutoryMemberCsv()`, assert header line equals `Sr,UAN,Employee Name,Emp ID,Gross Payable,PF Wages,PF EE,PF ER,ESIC IP No,ESIC Wages,ESIC EE,ESIC ER,PT`, line count = employees+2, and a known UAN cell starts with `'`.
5. PDF opts: stub `window.parent.postMessage` interception (harness listener for `ST_REPORT`), call `reportStatutoryMemberPdf()`, assert `reportType==='statutoryRegister'` and `opts.rows[0]` has keys `uan,pfWages,pfEE,pfER,esicIp,esicWages,esicEE,esicER,pt`.
6. Engine (shell window): `SaagarReport.list().some(x=>x.type==='statutoryRegister')`; `buildModel('statutoryRegister',{})` internal check via `SaagarReport.preview('statutoryRegister',{})` → renders the empty-state note, no throw; then preview with a 2-row fixture → table foot totals match fixture totals.
7. Regression: `reportStatutoryCsv()` and `reportStatutoryPdf()` still work unchanged; 0 console errors after full tab sweep.
8. (Impl owner note: payroll.html has a `type="application/json"` seed block at `app-data` — syntax-check only real `<script>` blocks.)

## Risk & blast radius
- **Low.** Pure-read feature: no writes, no schema change, no bridge/EOD/exceptions surface, no shell index.html edit (ST_REPORT is type-agnostic at L6729).
- Touch points shared with Wave-11 payroll siblings (P1-48/P1-27, same file owner): Reports-tab card markup L1166-1171, the L3115-3133 report-function block, `openEngineReport` kind-branch, and the saagar-report.js BUILDERS/META maps — coordinate insert order within the single owner; keep this builder self-contained after `statutorySummary`.
- Worst failure mode: a malformed builder would throw inside `buildModel` (saagar-report.js L1189 `throw`), which `openEngineReport`'s try/catch surfaces as a toast in the standalone path and the shell's ST_REPORT try/catch swallows — other reports unaffected.
- CSV opens in Excel with apostrophe-prefixed UAN cells (cosmetic `'` visible in raw text editors) — accepted trade-off already shipped in Bank CSV.