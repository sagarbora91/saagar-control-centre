# P1-6

SUMMARY: Adds a read-only "Monthly" tab to the stock module: for a picked YYYY-MM it enumerates the existing saagar_stock_<store>_<date> day blobs, re-applies the Daily Summary's exact per-brand variance formula (closingSys/totalPhys/isCounted) per day, and renders brand rows with month totals on screen (mobile-sane, auto-stacking) plus a full brand×day grid, repeat-offender table and theft log (consuming P1-7's optional theftRemark/theftVerified) in an A4-landscape print via the module's existing stPrintDoc → shell ST_PRINT preview bridge. Zero writes, zero new persisted fields, zero new localStorage keys; normaliseImportData is untouched.

NEW FIELDS: []

NEW KEYS: []

BRIDGE CONTRACT: none — integration-bridge.js is not read, written, or edited by P1-6. (Intra-module consumption only: the report READS the optional P1-7 fields movements[brand].theftRemark {string} and movements[brand].theftVerified {boolean} inside stock's own saagar_stock_<store>_<YYYY-MM-DD> day blobs when present; absent = legacy, rendered as '—' / no badge. Carrying those fields through normaliseImportData is P1-7's contract, not P1-6's.)

# P1-6 — Monthly Variance & Shrinkage Report (per store / brand)

Effort M / risk low. READ-ONLY over existing data. One file edited: the decoded stock blob. No bridge edits, no shell edits.

## Target

**Edited file:** `V:/Co work/Projects/Retail/_extracted_modules/stock.html` (decoded blob — re-embed into `www/index.html` via the established embed pipeline, e.g. scratchpad `p1plan/embed.js`).

Insertion / reference anchors (current line numbers):

| Anchor | Lines | Use |
|---|---|---|
| Tab nav markup (`tbtn-opening…tbtn-settings`) | 474–480 | INSERT new `tbtn-monthly` button after line 478 (`tbtn-summary`), before `tbtn-settings` (479) |
| `sec-summary` block | 625–662 | NOT edited (P1-8 owns its interior). INSERT new `sec-monthly` section between line 662 (`</div>` closing sec-summary) and line 664 (SETTINGS comment) |
| `renderSummary()` | 1473–1561 | Formula REFERENCE ONLY — per-brand math at 1491–1507 is reused verbatim; function is NOT edited (P1-8 adds its DSR cross-check line inside it — regions disjoint) |
| `goTab()` dispatch | 2047–2081 | ADD one `else if (tab === 'monthly') renderMonthly();` after line 2079 |
| `printSummaryReg()` | 2599–2660 | Print-side formula reference (2612–2627); INSERT `printMonthlyReg()` after line 2660 |
| Print helpers reused as-is | `stEsc` 2446, `stPrintDoc` 2447–2457, `stStoreFull` 2464, `stHead` 2465–2470, `stVar` 2479 | `stMeta()` (2471–2477) is NOT reused — it prints the daily `st.date`; monthly builds its own `.stp-meta` div |
| Core math reused as-is | `isCounted` 1018–1025, `totalPhys` 1028–1035, `closingSys` 1075–1084, `varClass` 1104, `varText` 1107 | THE variance formula — do not re-derive |
| Storage/utility reused | `SK_PREFIX` 820 (`'saagar_stock_'`), `dataKey()` 941 (shape `SK_PREFIX + store + '_' + YYYY-MM-DD`), `getBrands` 826–852, `fmtDate` 880, `esc` 2432, `emptyStateRow` 2701, `applyReadOnlyChrome` 1173–1186, `toast` 2683 | |
| Role split | `st.mode` ('sm'/'cro') at 864; `setMode`/`smAuthSubmit`/`commitMode` 2086–2131 | Monthly tab is visible to BOTH modes (read-only report; mirrors the daily Summary tab which is ungated) |
| New JS insertion | after `renderSummary()` closing brace (line 1561) | `_monMonth/_monN` + `monDaysIn/monRawDay/monCellCalc/monAggregate/monLabel/monSetMonth/monSetN/renderMonthly` |

**NOT edited:** `www/index.html` — the shell's ST_PRINT path already exists and is reused unchanged: message route `if(e.data.type === 'ST_PRINT') stPrintBridge(e.data)` at line 6725; `stPrintBridge()` 6761–6793 (injects module-supplied `css` at 6783); shared `.stp-*` print theme 750–774; landscape via `html.st-preview-land` (line 747). **NOT edited:** `integration-bridge.js` (its `sb._dsrRollup` write at ~329 only informs an edge case below). **NOT edited:** `normaliseImportData()` 2238–2287 — no new persisted fields.

## Additive-safe

**TRUE.**
- Pure read path: renders from `localStorage.getItem(SK_PREFIX + store + '_' + date)` + `JSON.parse`; never calls `saveData()`/`localStorage.setItem`. No `roBlock()` needed because there is nothing to block.
- Zero new persisted fields, zero new localStorage keys → nothing to carry in `normaliseImportData()`; existing blobs are never reshaped.
- All new DOM ids are `mon-*` / `sec-monthly` / `tbtn-monthly` (no collisions — verified `monthly` does not appear in the current file). All new functions are `mon*`-prefixed except `renderMonthly`/`printMonthlyReg` (also absent today).
- The only shared-region touches are one new `<button>` in the tab nav (474–480) and one new `else if` in `goTab` (2079/2080) — neither is a P1-7/P1-8 edit region. P1-8 edits `renderSummary()`'s interior + `sec-summary` markup; P1-6 does not enter either.

## Approach

**Step 1 — Tab button (line 478).** Insert after `tbtn-summary`:
```html
  <button class="tab-btn"        id="tbtn-monthly"   onclick="goTab('monthly')">Monthly</button>
```
`.tab-nav` already has `overflow-x:auto` (line 39) so a 6th tab scrolls on phones. No `tab-locked` class — open to CRO and SM.

**Step 2 — goTab dispatch (after line 2079).**
```js
  else if (tab === 'monthly')   renderMonthly();
```
No gate needed (Settings/Closing gates at 2049–2065 untouched).

**Step 3 — `sec-monthly` markup** (insert between lines 662 and 664 — full block, exact copy in UI section below). Uses existing classes only: `.sec/.print-hdr/.sec-hdr/.btn-row/.info-bar/.scards/.tbl-wrap/.rtbl/.finp`. The `.rtbl` + `data-label` pattern gives the free ≤640px card-stacking (CSS lines 402–417), so the SCREEN view is brand rows with month totals — the brand×day grid ships only in the A4 print (this is the "renders sanely on mobile" choice the register asked us to make).

**Step 4 — Month aggregation (insert after line 1561).** Day-blob enumeration uses the exact key scheme from `dataKey()` (941):
```js
/* ══════════ P1-6 MONTHLY VARIANCE & SHRINKAGE — read-only over saved day blobs ══════════ */
let _monMonth = null;   // 'YYYY-MM' — in-memory only, NOT persisted (no carry impact)
let _monN     = 3;      // repeat-offender threshold (days) — in-memory only

function monDaysIn(ym){ const p = ym.split('-'); return new Date(+p[0], +p[1], 0).getDate(); }
function monLabel(ym){ const p = ym.split('-');
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+p[1]-1] + ' ' + p[0]; }

/* RAW day read — deliberately NOT loadData(): loadData() is bound to st.date and
   runs prefillOpeningFromPrev/initData. This never writes and never fabricates rows. */
function monRawDay(store, dateStr){
  try{
    const raw = localStorage.getItem(SK_PREFIX + store + '_' + dateStr);
    if(!raw) return null;
    const d = JSON.parse(raw);
    if(!d || typeof d !== 'object') return null;
    /* integration-bridge.js (~line 329) may create a day blob holding ONLY _dsrRollup
       (sb={} when absent) — no opening/movements/closing sections = no stock data. */
    if(!d.opening && !d.movements && !d.closing) return null;
    return d;
  }catch(e){ return null; }
}

/* Per-brand/per-day cell math — EXACT reuse of the Daily Summary formula
   (renderSummary 1491–1507 / printSummaryReg 2612–2627):
   clS = closingSys(brand, data); clP = totalPhys(closing) ?? 0; vr = clP − clS;
   counted = isCounted(closing); hasActivity per FIX 3.
   `?? null` on systemStock makes a RAW blob's missing brand entry ({} →
   systemStock undefined) behave exactly like loadData()'s normalised
   {systemStock:null} — otherwise `undefined !== null` fakes activity. */
function monCellCalc(brand, day){
  const dd = { opening: day.opening || {}, movements: day.movements || {} }; // closingSys derefs both
  const o = dd.opening[brand]   || {};
  const m = dd.movements[brand] || {};
  const c = (day.closing || {})[brand] || {};
  const inw = m.inward ?? 0, grn = m.grn ?? 0, outw = m.outward ?? 0,
        sales = m.sales ?? 0, theft = m.theft ?? 0;
  const clS = closingSys(brand, dd);
  const clP = totalPhys(c) ?? 0;
  const vr  = clP - clS;
  const counted = isCounted(c);
  const hasActivity = (o.systemStock ?? null) !== null
                   || inw > 0 || grn > 0 || outw > 0 || sales > 0 || theft > 0
                   || clS !== 0;
  return { vr, counted, hasActivity, theft,
           theftRemark:   (typeof m.theftRemark === 'string' ? m.theftRemark : ''), // P1-7 optional
           theftVerified: m.theftVerified === true };                                // P1-7 optional
}

function monAggregate(store, ym){
  const n = monDaysIn(ym), days = [], brandSet = {};
  getBrands(store).forEach(b => { brandSet[b] = 1; });
  for(let i = 1; i <= n; i++){
    const ds = ym + '-' + String(i).padStart(2,'0');
    const d  = monRawDay(store, ds);
    if(!d) continue;
    /* Union brand keys from the blobs so brands REMOVED from the list mid-month
       (removeBrand 2182–2192 preserves their data) still report. */
    ['opening','movements','closing'].forEach(sec => {
      const s = d[sec]; if(s && typeof s === 'object') Object.keys(s).forEach(b => { brandSet[b] = 1; });
    });
    days.push({ dayNum: i, date: ds, data: d });
  }
  const rows = Object.keys(brandSet).map(brand => {
    const r = { brand, daysActive:0, daysCounted:0, varDays:0, netVar:0, theftUnits:0,
                theftDays:0, offendDays:0, worstGap:0, worstGapDate:'', cells:{}, thefts:[] };
    days.forEach(dy => {
      const cell = monCellCalc(brand, dy.data);
      r.cells[dy.dayNum] = cell;
      if(cell.hasActivity) r.daysActive++;
      if(cell.hasActivity && cell.counted){          // netVar sums ONLY counted-day cells —
        r.daysCounted++; r.netVar += cell.vr;        // mirrors the daily grid's '—' rule
        if(cell.vr !== 0){
          r.varDays++;
          if(Math.abs(cell.vr) > Math.abs(r.worstGap)){ r.worstGap = cell.vr; r.worstGapDate = dy.date; }
        }
      }
      if(cell.theft > 0){
        r.theftUnits += cell.theft; r.theftDays++;
        r.thefts.push({ date: dy.date, brand, units: cell.theft,
                        remark: cell.theftRemark, verified: cell.theftVerified });
      }
      if((cell.hasActivity && cell.counted && cell.vr !== 0) || cell.theft > 0) r.offendDays++;
    });
    return r;
  }).filter(r => r.daysActive > 0 || r.theftUnits > 0);   // hide brands with zero month activity
  rows.sort((a,b) => (b.offendDays - a.offendDays) || (Math.abs(b.netVar) - Math.abs(a.netVar))
                  || (b.theftUnits - a.theftUnits) || a.brand.localeCompare(b.brand));
  return { ym, nDays: n, days, rows };
}
```
**Repeat-offender definition** (register's "variance/theft in ≥N days"): `offendDays` = distinct days where (counted && vr ≠ 0) OR theft > 0; flagged when `offendDays >= _monN` (UI-selectable 2–5, default 3, not persisted).

**Step 5 — `renderMonthly()`** (same insertion block):
```js
function monSetMonth(v){ if(/^\d{4}-\d{2}$/.test(v || '')){ _monMonth = v; renderMonthly(); } }
function monSetN(v){ const n = parseInt(v, 10); if(n >= 2 && n <= 10){ _monN = n; renderMonthly(); } }

function renderMonthly(){
  const ym  = _monMonth || (_monMonth = st.date.slice(0,7));   // default: viewed date's month
  const agg = monAggregate(st.store, ym);
  const full = st.store === 'titanworld' ? 'Titan World (WLMHW)' : 'Helios (HEMW)';
  _el('mon-month',  el => { el.value = ym; });
  _el('mon-n',      el => { el.value = String(_monN); });
  _el('ph-mon-sub', el => { el.textContent = full + ' · ' + monLabel(ym); });

  let tCounted=0, tVarDays=0, tNet=0, tTheft=0, offCount=0;
  const theftDaySet = {};
  agg.rows.forEach(r => { tCounted += r.daysCounted; tVarDays += r.varDays; tNet += r.netVar;
    tTheft += r.theftUnits; if(r.offendDays >= _monN) offCount++;
    r.thefts.forEach(t => { theftDaySet[t.date] = 1; }); });
  const tTheftDays = Object.keys(theftDaySet).length;
  const clean = agg.rows.filter(r => r.varDays === 0 && r.theftUnits === 0).length;

  document.getElementById('mon-cards').innerHTML = `
    <div class="scard"><div class="scard-lbl">Days With Data</div><div class="scard-val">${agg.days.length}</div><div class="scard-sub">of ${agg.nDays} in ${esc(monLabel(ym))}</div></div>
    <div class="scard"><div class="scard-lbl">Net Month Variance</div><div class="scard-val" style="color:${tNet===0?'var(--green)':tNet>0?'var(--amber)':'var(--red)'}">${tNet===0?'0':varText(tNet)}</div><div class="scard-sub">Counted days only</div></div>
    <div class="scard"><div class="scard-lbl">Theft / Loss</div><div class="scard-val" style="color:var(--red)">${tTheft}</div><div class="scard-sub">Units this month</div></div>
    <div class="scard"><div class="scard-lbl">Theft Days</div><div class="scard-val" style="color:var(--red)">${tTheftDays}</div><div class="scard-sub">Days with theft</div></div>
    <div class="scard"><div class="scard-lbl">Repeat Offenders</div><div class="scard-val" style="color:${offCount?'var(--red)':'var(--green)'}">${offCount}</div><div class="scard-sub">Variance/theft ≥ ${_monN} days</div></div>
    <div class="scard"><div class="scard-lbl">Clean Brands</div><div class="scard-val" style="color:var(--green)">${clean}</div><div class="scard-sub">of ${agg.rows.length} active</div></div>`;

  document.getElementById('tbody-mon').innerHTML = agg.rows.length ? agg.rows.map(r => {
    const off = r.offendDays >= _monN;
    const badge = off
      ? `<span style="color:var(--red);font-size:11px;font-weight:600;">⚠ Repeat offender (${r.offendDays}d)</span>`
      : (r.varDays === 0 && r.theftUnits === 0)
        ? '<span style="color:var(--green);font-size:11px;font-weight:600;">✓ Clean</span>'
        : `<span style="color:var(--amber);font-size:11px;font-weight:600;">Watch (${r.offendDays}d)</span>`;
    return `<tr${off ? ' style="background:#fff7f7"' : ''}>
      <td class="brand-td name-cell">${esc(r.brand)}</td>
      <td data-label="Days Counted">${r.daysCounted || '—'}${r.daysActive > r.daysCounted ? ` <span style="color:var(--amber);font-size:10px;">of ${r.daysActive}</span>` : ''}</td>
      <td data-label="Variance Days">${r.varDays || '—'}</td>
      <td data-label="Net Variance" class="${varClass(r.netVar)}">${varText(r.netVar)}</td>
      <td data-label="Theft Units"${r.theftUnits ? ' style="color:var(--red)"' : ''}>${r.theftUnits || '—'}</td>
      <td data-label="Theft Days">${r.theftDays || '—'}</td>
      <td data-label="Worst Gap">${r.worstGap ? `${varText(r.worstGap)} <span style="color:var(--gray-400);font-size:10px;">${fmtDate(r.worstGapDate)}</span>` : '—'}</td>
      <td data-label="Status">${badge}</td>
    </tr>`; }).join('')
    : `<tr class="empty-row"><td colspan="8"><div class="tbl-empty"><span class="ico">📅</span><div class="ttl">No stock records for ${esc(monLabel(ym))}</div><div class="msg">Pick another month, or save daily registers first.</div></div></td></tr>`;

  document.getElementById('tfoot-mon').innerHTML = agg.rows.length ? `<tr>
    <td class="tl">TOTAL — ${agg.rows.length} brands</td>
    <td>${tCounted}</td><td>${tVarDays}</td>
    <td class="${varClass(tNet).replace('cv ','')}">${varText(tNet)}</td>
    <td>${tTheft}</td><td>${tTheftDays}</td><td></td>
    <td>${offCount ? offCount + ' offender' + (offCount > 1 ? 's' : '') : ''}</td></tr>` : '';

  /* Theft / Loss log — consumes P1-7 theftRemark/theftVerified when present */
  const thefts = [];
  agg.rows.forEach(r => { r.thefts.forEach(t => thefts.push(t)); });
  thefts.sort((a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.brand.localeCompare(b.brand));
  const tw = document.getElementById('mon-theft-wrap');
  if(thefts.length){
    tw.style.display = '';
    document.getElementById('mon-theft-count').textContent = thefts.length + ' entr' + (thefts.length === 1 ? 'y' : 'ies');
    document.getElementById('mon-theft-body').innerHTML = thefts.map(t => `<tr>
      <td class="brand-td name-cell">${fmtDate(t.date)}</td>
      <td data-label="Brand">${esc(t.brand)}</td>
      <td data-label="Units" style="color:var(--red);font-weight:600;">${t.units}</td>
      <td data-label="Remark" class="tl">${t.remark ? esc(t.remark) : '<span style="color:var(--gray-400)">—</span>'}</td>
      <td data-label="Verified">${t.verified ? '<span style="color:var(--green);font-size:11px;font-weight:600;">✓ SM verified</span>' : '<span style="color:var(--gray-400);font-size:11px;">—</span>'}</td>
    </tr>`).join('');
  } else { tw.style.display = 'none'; }

  applyReadOnlyChrome();   // consistency with every other renderer (1173)
}
```

**Step 6 — `printMonthlyReg()` (insert after line 2660).** Reuses THE existing print path: builds `.stp-*` body → `stPrintDoc()` (2447) → shell `ST_PRINT` preview (index.html 6725/6761) with Print / Save-PDF / Share. Landscape A4; brand×day grid lives HERE (paper has the width; phones don't).
```js
/* ── 5. MONTHLY VARIANCE & SHRINKAGE (P1-6) ── */
function printMonthlyReg(){
  const ym  = _monMonth || st.date.slice(0,7);
  const agg = monAggregate(st.store, ym);
  let body = stHead('Monthly Variance & Shrinkage', monLabel(ym))
    + '<div class="stp-meta">'
    +   '<span><b>Month:</b> ' + stEsc(monLabel(ym)) + '</span>'
    +   '<span><b>Store:</b> ' + stEsc(stStoreFull()) + '</span>'
    +   '<span><b>Days with data:</b> ' + agg.days.length + ' / ' + agg.nDays + '</span>'
    +   '<span><b>Repeat offender rule:</b> variance/theft on ≥ ' + _monN + ' days</span>'
    + '</div>';
  if(!agg.rows.length){
    body += '<div class="stp-empty">No stock records for ' + stEsc(monLabel(ym)) + '.</div>';
  } else {
    let tNet = 0, tTheft = 0, offRows = [];
    agg.rows.forEach(r => { tNet += r.netVar; tTheft += r.theftUnits; if(r.offendDays >= _monN) offRows.push(r); });
    body += '<div class="stp-cards">'
      + '<div class="stp-card"><h4>Net Month Variance</h4><div class="v">' + (tNet === 0 ? '0' : stVar(tNet)) + '</div></div>'
      + '<div class="stp-card"><h4>Theft / Loss Units</h4><div class="v">' + tTheft + '</div></div>'
      + '<div class="stp-card"><h4>Repeat Offenders</h4><div class="v">' + offRows.length + ' / ' + agg.rows.length + '</div></div>'
      + '</div>';
    /* Brand × day grid */
    let head = '<tr><th>Brand</th>';
    for(let i = 1; i <= agg.nDays; i++) head += '<th class="stp-c">' + i + '</th>';
    head += '<th class="stp-r">Net</th><th class="stp-r">Theft</th></tr>';
    const grid = agg.rows.map(r => {
      const off = r.offendDays >= _monN;
      let tr = '<tr' + (off ? ' class="stp-off"' : '') + '><td>' + stEsc(r.brand) + (off ? ' ⚠' : '') + '</td>';
      for(let i = 1; i <= agg.nDays; i++){
        const c = r.cells[i]; let txt = '';
        if(c && c.hasActivity){ txt = !c.counted ? '—' : (c.vr === 0 ? '0' : stVar(c.vr)); if(c.theft > 0) txt += '*'; }
        else if(c && c.theft > 0){ txt = '*'; }
        tr += '<td class="stp-c' + (c && c.hasActivity && c.counted && c.vr !== 0 ? ' stp-gap' : '') + '">' + txt + '</td>';
      }
      return tr + '<td class="stp-r">' + (r.netVar === 0 ? '0' : stVar(r.netVar)) + '</td><td class="stp-r">' + (r.theftUnits || '') + '</td></tr>';
    }).join('');
    body += '<div class="stp-sec mon-grid-sec"><div class="stp-sec-t">Brand × Day Variance Grid</div>'
      + '<table class="stp-table mon-grid"><thead>' + head + '</thead><tbody>' + grid + '</tbody></table>'
      + '<div class="stp-foot" style="text-align:left">Cell = closing physical − closing system (Daily Summary formula) · “—” = activity but not counted · “*” = theft recorded that day · blank = no data · ⚠ = repeat offender (≥ ' + _monN + ' days with variance/theft).</div></div>';
    /* Repeat offenders */
    body += '<div class="stp-sec"><div class="stp-sec-t">Repeat Offender Brands (variance/theft on ≥ ' + _monN + ' days)</div>';
    body += offRows.length
      ? '<table class="stp-table"><thead><tr><th>Brand</th><th class="stp-r">Offending Days</th><th class="stp-r">Variance Days</th><th class="stp-r">Theft Days</th><th class="stp-r">Net Variance</th><th class="stp-r">Theft Units</th></tr></thead><tbody>'
        + offRows.map(r => '<tr><td>' + stEsc(r.brand) + '</td><td class="stp-r">' + r.offendDays + '</td><td class="stp-r">' + r.varDays + '</td><td class="stp-r">' + r.theftDays + '</td><td class="stp-r">' + stVar(r.netVar) + '</td><td class="stp-r">' + r.theftUnits + '</td></tr>').join('')
        + '</tbody></table>'
      : '<div class="stp-empty">None — no brand crossed the threshold this month.</div>';
    body += '</div>';
    /* Theft / Loss log — P1-7 remarks when present */
    const thefts = []; agg.rows.forEach(r => r.thefts.forEach(t => thefts.push(t)));
    thefts.sort((a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.brand.localeCompare(b.brand));
    if(thefts.length){
      body += '<div class="stp-sec"><div class="stp-sec-t">Theft / Loss Log</div>'
        + '<table class="stp-table"><thead><tr><th>Date</th><th>Brand</th><th class="stp-r">Units</th><th>Remark</th><th>Verified</th></tr></thead><tbody>'
        + thefts.map(t => '<tr><td>' + stEsc(fmtDate(t.date)) + '</td><td>' + stEsc(t.brand) + '</td><td class="stp-r">' + t.units + '</td><td>' + (t.remark ? stEsc(t.remark) : '<span class="stp-mut">—</span>') + '</td><td>' + (t.verified ? '✓ SM' : '<span class="stp-mut">—</span>') + '</td></tr>').join('')
        + '</tbody></table></div>';
    }
  }
  stPrintDoc({
    title: 'Stock — Monthly Variance & Shrinkage',
    fileBase: 'Stock-Monthly-' + st.store + '-' + ym,
    orientation: 'landscape',
    css: '.mon-grid th,.mon-grid td{padding:2px 3px !important;font-size:6.5pt !important}'
       + '.mon-grid td.stp-gap{color:#b00020;font-weight:700}'
       + 'tr.stp-off td:first-child{color:#b00020;font-weight:700}'
       + '.mon-grid-sec{page-break-inside:auto}',   // grid may exceed one page — don't force-keep
    body
  });
}
```
(The shell injects the `css` param at index.html line 6783; 33 columns at 6.5pt fit 297mm landscape.)

**Step 7 — re-embed** stock.html into the shell blob via the established pipeline; no shell/bridge source edits.

## Data model & CARRY analysis

- **New persisted fields: NONE.** `_monMonth`/`_monN` are module-scope `let` variables, reset on module load, deliberately not written to `SK_STATE` (`saveAppState()` at 1012 stays `{store,date}` byte-identical).
- **New localStorage keys: NONE.** The feature never calls `localStorage.setItem`.
- **`normaliseImportData()` (2238): UNTOUCHED.** Nothing to carry. Cross-item note for the Wave-9 impl owner: P1-7 must carry its own `theftRemark`/`theftVerified` in the movements block (2262–2268) in the wave's single combined normalise edit — P1-6 only READS those fields and already degrades gracefully if an import stripped them (legacy path).
- Consumed existing data: day blobs `saagar_stock_<store>_<YYYY-MM-DD>` (sections `opening/movements/closing`, brand-keyed; top-level `_v/openingLocked/closingLocked/movementsSubmitted/_dsrRollup` ignored), `saagar_brands`/`saagar_master_brands` via `getBrands()`.

## UI

**New tab** (tab-nav, after Summary Report): label **`Monthly`**.

**New section `sec-monthly`** (exact markup; insert between lines 662 and 664):
```html
  <!-- ══════════════════ MONTHLY (P1-6) ══════════════════ -->
  <div class="sec" id="sec-monthly">
    <div class="print-hdr">
      <h2 id="ph-mon-title">Monthly Variance &amp; Shrinkage Report</h2>
      <p  id="ph-mon-sub"></p>
    </div>
    <div class="sec-hdr">
      <div>
        <div class="sec-title">Monthly Report</div>
        <div class="sec-sub">Variance &amp; shrinkage — brand-wise month view</div>
      </div>
      <div class="btn-row no-print">
        <input type="month" class="finp" id="mon-month" style="max-width:170px" onchange="monSetMonth(this.value)">
        <select class="finp" id="mon-n" style="max-width:180px" onchange="monSetN(this.value)"
                title="A brand is a repeat offender when it has a counted variance or theft on at least this many days of the month">
          <option value="2">Offender ≥ 2 days</option>
          <option value="3" selected>Offender ≥ 3 days</option>
          <option value="4">Offender ≥ 4 days</option>
          <option value="5">Offender ≥ 5 days</option>
        </select>
        <button class="btn btn-gold btn-sm" onclick="printMonthlyReg()">🖨 Print A4</button>
      </div>
    </div>
    <div class="info-bar">
      <span>📅</span>
      <span>Reads the saved daily registers for the chosen month — view only, nothing is written. A brand is flagged <strong>repeat offender</strong> when it has a counted variance or theft on the set number of days.</span>
    </div>
    <div class="scards" id="mon-cards"></div>
    <div class="tbl-wrap">
      <table class="rtbl">
        <thead>
          <tr class="hdr-row">
            <th class="tl" style="min-width:110px">Brand</th>
            <th>Days<br>Counted</th>
            <th title="Days where counted physical ≠ closing system">Variance<br>Days</th>
            <th>Net<br>Variance</th>
            <th title="Total theft / loss units in the month">Theft<br>Units</th>
            <th>Theft<br>Days</th>
            <th>Worst Gap</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="tbody-mon"></tbody>
        <tfoot id="tfoot-mon"></tfoot>
      </table>
    </div>
    <div id="mon-theft-wrap" style="display:none;margin-top:16px">
      <div class="sec-sub" style="margin-bottom:8px">Theft / Loss log — <span id="mon-theft-count"></span></div>
      <div class="tbl-wrap">
        <table class="rtbl">
          <thead><tr class="hdr-row"><th class="tl">Date</th><th class="tl">Brand</th><th>Units</th><th class="tl" style="min-width:120px">Remark</th><th>Verified</th></tr></thead>
          <tbody id="mon-theft-body"></tbody>
        </table>
      </div>
    </div>
  </div>
```
**Exact copy** (as rendered by Step 5/6 code): status badges `⚠ Repeat offender (Nd)` / `Watch (Nd)` / `✓ Clean`; empty state `No stock records for <Mon YYYY>` + `Pick another month, or save daily registers first.`; theft remark fallback `—`; verified badge `✓ SM verified` (screen) / `✓ SM` (print); print legend `Cell = closing physical − closing system (Daily Summary formula) · “—” = activity but not counted · “*” = theft recorded that day · blank = no data · ⚠ = repeat offender (≥ N days with variance/theft).` All user strings pass through `esc()` on screen and `stEsc()` in print; values are unit counts (no ₹ anywhere, so no `toLocaleString('en-IN')` needed — matches the daily Summary's raw-integer rendering).

## Edge cases

1. **`_dsrRollup`-only day blob** — the bridge creates `sb={}` then sets only `_dsrRollup` (integration-bridge.js ~328–330) for a day stock never opened. `monRawDay()` returns null when all three sections are absent → treated as "no data", not a phantom active day.
2. **Missing brand entry in a raw blob** (`d.opening[b]` undefined → `o.systemStock === undefined`): the daily code sees `null` (loadData normalises); monthly must use `(o.systemStock ?? null) !== null` in `hasActivity` or every empty day counts as active. Handled in `monCellCalc`. `closingSys` itself is safe (`?.` + `??` at 1076–1083) once passed `{opening:d.opening||{}, movements:d.movements||{}}`.
3. **Brand removed mid-month** (`removeBrand` 2182 keeps data): brand-key union across the month's blobs keeps its history in the report. Brand added mid-month simply has blank earlier days.
4. **Uncounted (Pending) days** are EXCLUDED from `netVar`/`varDays` — same rule as the daily grid cell ('—' when not counted). Note: the daily footer TOTAL (1539–1546) does include clP=0 for uncounted brands; that is a same-day display total, not a cross-day metric — the monthly report intentionally follows the per-cell rule, stated in the print legend.
5. **Offsetting variances** (+2 one day, −2 another → netVar 0) can mask a churn pattern — that's exactly what `varDays`/`offendDays` (count-based, not sum-based) catch; both are always shown beside netVar.
6. **Current incomplete month / future days**: only saved days enumerate; future-day columns render blank. Feb/30/31-day months via `new Date(y, m, 0).getDate()`.
7. **Legacy theft rows (pre-P1-7)** have no `theftRemark`/`theftVerified`: log renders remark `—` and no verified badge; `m.theftVerified === true` guard means truthy garbage never fakes verification.
8. **Empty month**: KPI cards render zeros, table shows empty state; Print still allowed and emits a `stp-empty` body — matches the daily builders' `No entries.` behaviour (2487 etc.).
9. **Corrupt day JSON**: `monRawDay` try/catch returns null — one bad day never kills the month.
10. **Past-view read-only rail** (`window.__stAsOf`, `isPastView` 905): monthly performs zero writes so it is inherently safe; `applyReadOnlyChrome()` is still called for the body-class consistency every renderer keeps. Print/Export buttons remain visible in RO by existing design (CSS 427–438 hides only listed ids).
11. **Role**: tab is ungated (CRO + SM), like the daily Summary. No `roBlock()` calls needed — verify no accidental `saveData` in the new code.
12. **`<input type="month">`** is native on Android WebView + desktop Chrome (the app's two targets). If an exotic browser renders it as text, `monSetMonth`'s `/^\d{4}-\d{2}$/` regex rejects junk and the view just keeps the current month.
13. **31-column print width**: custom `css` shrinks grid cells to 6.5pt; `.mon-grid-sec{page-break-inside:auto}` overrides the theme's `.stp-sec` keep-together (761) so a long brand list paginates instead of overflowing one page.
14. **P1-8 co-existence**: P1-8 edits `renderSummary()` interior + `sec-summary` markup; P1-6 never touches either. Shared file hotspots are only the tab-nav block (new line after 478) and `goTab` (new line after 2079) — neither is a P1-8 region. If both land in one wave, apply P1-6's two one-line insertions after P1-8's diff to avoid offset drift.

## Verify (browser harness — drive via `moduleFrame.contentWindow.eval` since module state is block-scoped; indirect eval shares the global lexical scope so `st`, `renderMonthly` etc. resolve)

Setup: load the shell, open the Stock module, then seed one month of blobs **through the module frame** (so the SaagarStore shim path is exercised):
```js
moduleFrame.contentWindow.eval(`(function(){
  function put(d, data){ localStorage.setItem('saagar_stock_titanworld_'+d, JSON.stringify(data)); }
  function day(sys, sales, theft, phys, extra){
    var m = Object.assign({inward:null,outward:null,sales:sales,grn:null,theft:theft}, extra||{});
    return { _v:2, openingLocked:true, closingLocked:true, movementsSubmitted:true,
      opening:{ 'TITAN':{display:null,storage:null,defective:null,yLoc:null,systemStock:sys,remarks:'',croName:'A',time:'',verified:true,countDone:false} },
      movements:{ 'TITAN': m },
      closing:{ 'TITAN':{display:phys,storage:0,defective:0,yLoc:0,remarks:'',croName:'A',time:'',verified:false,countDone:true} } };
  }
  put('2026-06-01', day(10,2,0,8));                                            // match: clS=8, phys=8, vr=0
  put('2026-06-05', day(10,2,1,6));                                            // gap −1 + legacy theft (no remark)
  put('2026-06-10', day(10,0,1,8,{theftRemark:'display case forced',theftVerified:true})); // P1-7 fields: clS=9, phys=8 → vr=−1
  put('2026-06-15', day(10,1,1,9,{theftRemark:'',theftVerified:false}));       // clS=8, phys=9 → vr=+1
  put('2026-06-20', {_dsrRollup:{openingTotal:1,closingTotal:1,cros:['x'],source:'dsr'}}); // bridge-only blob
  put('2026-06-25', { _v:2, opening:{}, movements:{}, closing:{} });           // sections present, brand entry missing
})()`);
```
1. **Formula parity**: `eval("st.store='titanworld'; goTab('monthly'); monSetMonth('2026-06'); JSON.stringify(monAggregate('titanworld','2026-06').rows.find(r=>r.brand==='TITAN'))")` → expect `daysActive:4, daysCounted:4, varDays:3, netVar:-1, theftUnits:3, theftDays:3, offendDays:4` (union of gap-days {5,10,15} and theft-days {5,10,15} = distinct days 5,10,15 **plus** — confirm day 10 counts once). Assert values match hand-computed `clP − closingSys` per day (formula reuse check).
2. **Bridge-only + empty-section blobs are inert**: same aggregate shows `days.length === 5` (01,05,10,15,25) — the `_dsrRollup`-only day 20 excluded, day 25 contributes zero activity (`hasActivity` false — the `?? null` guard).
3. **Offender toggle**: with default N=3, `document.querySelector('#tbody-mon td[data-label=\"Status\"]').textContent` contains `Repeat offender`; after `eval("monSetN('5')")` it contains `Watch`. KPI card "Repeat Offenders" flips 1 → 0.
4. **Theft log / P1-7 consumption**: `#mon-theft-body` has 3 rows; the 2026-06-10 row shows remark `display case forced` and `✓ SM verified`; the 2026-06-05 legacy row shows `—` in both Remark and Verified.
5. **Zero-write guarantee**: snapshot `JSON.stringify(Object.keys(localStorage).sort().map(k=>k+localStorage.getItem(k)))` before and after `goTab('monthly')` + `monSetMonth` + `printMonthlyReg()` → byte-identical.
6. **Print path**: call `eval("printMonthlyReg()")` in the module, then in the SHELL context assert `document.documentElement.classList.contains('st-preview-open')` is true, `#sp-doc` innerHTML contains `Monthly Variance & Shrinkage`, `Brand × Day Variance Grid`, a `-1*` cell (gap+theft marker) and the offender ⚠ row; landscape class `st-preview-land` set; then `stPreviewClose()`.
7. **Empty month**: `eval("monSetMonth('2026-01')")` → empty-state row text `No stock records for Jan 2026`; Print still opens with `stp-empty` body.
8. **Mobile stacking**: resize harness viewport to 375px → `#tbody-mon tr` computed `display:block`, first cell renders as navy card header (`.name-cell`), `data-label` pseudo-labels visible. Tab nav scrolls horizontally to reach `Monthly`.
9. **Store/date rail**: `eval("setStore('helios')")` re-renders monthly for Helios (empty); dispatch `st-date` event with a past date → monthly still renders and body gets `st-readonly` without hiding the Print button.
10. **Regression**: daily tabs untouched — run the existing Wave-4/8 stock harness checks (opening/movements/closing/summary render, CSV export, `printSummaryReg`) and confirm 0 errors.

## Risk & blast radius

- **Low.** Pure additive read-only view: no writes, no schema change, no bridge/shell edits, no changes inside any existing function except one `else if` in `goTab` and one `<button>` in the tab nav.
- Worst plausible failure: a render error inside `renderMonthly` — confined to the new tab (every other tab renders through untouched paths); `monRawDay`'s try/catch already contains bad-JSON days.
- Formula drift risk is eliminated by delegating to the SAME `closingSys/totalPhys/isCounted` functions the daily Summary uses; the only re-stated expression is `hasActivity` (copied from 1504–1506 with the documented `?? null` raw-blob guard). If P1-8 ever changes the daily formula itself, `monCellCalc` inherits it automatically through those shared functions.
- Print volume: a 31-day × ~20-brand grid at 6.5pt landscape is within what the existing html2pdf Save/Share path already handles for the daily landscape summary; pagination is allowed via the `page-break-inside:auto` override.
- UTF-8 caution applies at embed time: re-embed byte-exact (never round-trip the shell through PowerShell Get/Set-Content).