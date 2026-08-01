# P1-8

SUMMARY: Bridge adds one optional integer field `salesCount` to the `_dsrRollup` object it already writes into the stock day blob (integration-bridge.js consumeDsrToStock L317-332), recomputed at each rollup write from ALL of today's submitted DSR records for that store (confirmed product bills: amount>0, type!=='service'), with store resolved via the employee master so Helios CROs stop mis-bucketing into WLMHW. Stock's renderSummary (stock.html L1473) gains one render-only reconciliation line under the summary cards — 'Stock sales X vs DSR sales Y — OK/mismatch' (amber on mismatch), plus a parity line in printSummaryReg — that is gracefully absent whenever _dsrRollup or salesCount is missing. No new localStorage keys, no stock-authored persisted fields; _dsrRollup already survives import because normaliseImportData mutates parsed.data in place and never strips unknown top-level keys (verified, no carry edit needed).

NEW FIELDS: [
 {
  "field": "salesCount",
  "where": "inside the bridge-owned `_dsrRollup` object on the stock day blob `saagar_stock_<titanworld|helios>_<YYYY-MM-DD>`",
  "type": "number (integer >= 0)",
  "default": "absent (undefined) — written only by the bridge at rollup-write time; stock renders the reconciliation line only when Number.isFinite(Number(salesCount)); deliberately NOT defaulted in normaliseImportData (the whole _dsrRollup object is carried implicitly because normaliseImportData mutates parsed.data in place and never deletes unknown top-level keys — verified at stock.html L2238-2287)"
 }
]

NEW KEYS: []

BRIDGE CONTRACT: integration-bridge.js consumeDsrToStock() adds `salesCount` (integer >= 0) to the `sb._dsrRollup` object it writes at L329 into localStorage key `saagar_stock_<titanworld|helios>_<today>`. COMPUTATION SOURCE: at every rollup write, recomputed in full (never incremented) by scanning ALL localStorage keys matching `^saagar_dsr_<today>_` (DSR records, dsr.html recKey L1544), keeping only records with `submitted===true` that resolve to the target store, and counting rows of `rec.sales[]` where `s.type !== 'service'` AND `Number(s.amount) > 0` — i.e. confirmed product bills, matching dsr.html's own confirmed-bill convention (L1849, L2962); excludes QMS service jobs (bridge-pushed rows with type:'service', integration-bridge.js L219) and unconfirmed qms-visitor placeholders (amount:'' — dsr.html L2279-2283). STORE RESOLUTION: r.store||r.storeCode when it is 'WLMHW'/'HEMW' (never set by DSR today), else employee-master (`saagar_employee_master_v1`) lookup by staffName mapping store text containing 'helios'→HEMW / 'titan'→WLMHW (master values are 'Titan World'/'Helios', dsr.html staffStore L1400-1408, demo-seed.js L53), else legacy default WLMHW — this same resolver replaces the bucket pick at L322 so salesCount and the rest of the rollup agree. STALENESS/AT: salesCount is valid as of the existing `_dsrRollup.at` ISO stamp, which is refreshed on every write; a write happens on any bridge cycle that consumes a new DSR_SUBMITTED event, including P1-12 corrected re-submit `:v<rev>` events (producer L146-150), so a correction triggers a fresh full recompute — no double count. Absent on legacy rollups and on days/stores with no submitted DSR; readers MUST treat missing/non-finite salesCount as 'no data' and render nothing.

# P1-8 — Sales units cross-check against DSR in the Stock daily Summary

**Effort S / risk low.** Movement "Sales" in Stock is hand-keyed and never reconciled. The bridge already writes `sb._dsrRollup` into the stock day blob (integration-bridge.js L329) but stock.html has **zero references** to `_dsrRollup` (verified by grep). This item (a) adds `salesCount` to that rollup with an exact contract, (b) renders ONE reconciliation line in Stock's Summary tab (+ a parity line in the A4 print), gracefully absent when the data is missing.

---

## Target (files / functions / lines)

**`V:/Co work/Projects/Retail/saagar-control-centre/www/integration-bridge.js`** (plain file, edited directly)
- `consumeDsrToStock(bus)` — **L317–332**. The rollup write is **L329**: `sb._dsrRollup={openingTotal:agg[sc].open,closingTotal:agg[sc].close,cros:agg[sc].cros,source:'dsr',note:'Auto roll-up from DSR — informational; SM count/lock unaffected',at:new Date().toISOString()}`. Store bucket pick is **L322**: `var st=(r.store||r.storeCode||'WLMHW').toUpperCase(), b=agg[st]||agg.WLMHW;`.
- Helpers already in scope: `dsrKey(date,name)` **L196** (`'saagar_dsr_'+date+'_'+nm(name).replace(/\s+/g,'_')`), `EMP_MASTER` **L28**, `STORE_KEY_MAP`/`skey()` **L36–37** (WLMHW→titanworld, HEMW→helios), `L()/S()` **L65–66**, `kk()` **L68**, `today()` **L63**.
- `DSR_SUBMITTED` producer **L146–150** — P1-12 re-submit posts a fresh `:v<rev>` event id, so a corrected DSR re-triggers this consumer.
- Test hook: `window.SaagarBridge.runNow()` **L744** runs `cycle()` **L720–741** synchronously.

**`V:/Co work/Projects/Retail/_extracted_modules/stock.html`** (decoded blob; re-embed via the established embed pipeline)
- Summary tab HTML **L624–662**; insertion anchor is `<div class="scards" id="sum-cards"></div>` **L640**.
- `renderSummary()` **L1473–1561** — per-brand `sales = m.sales ?? 0` at **L1493**, day total `tSales` accumulated at **L1500**, cards written at **L1549–1559**, empty-brands early return **L1479–1485**. **Reuse `tSales` — do not re-total.**
- `printSummaryReg()` **L2599–2660** — same totalling at **L2606/L2614/L2619**, cards block **L2643–2651** (parity line goes after it).
- Storage: `SK_PREFIX='saagar_stock_'` **L820**, `dataKey()` **L941** (`saagar_stock_<st.store>_<st.date>`, st.store ∈ titanworld|helios — matches the bridge's `skey()` output), `loadData()` **L943–959** (parses the whole blob, returns it — `_dsrRollup` rides along), `saveData()` **L1008** (stringifies the whole object — preserves `_dsrRollup` on every module save).
- Import/export: `validateImportSchema` ends **L2235** (does not reject unknown top-level keys), `normaliseImportData()` **L2238–2287** (see CARRY), `importJSON` **L2289**, `exportJSON` **L2343** (exports `loadData()` → includes `_dsrRollup`).
- Role: `st.mode` (`'cro'|'sm'`) **L864**, SM gate `smPassOk()` **L870–877** (shell Admin PIN hash), `setMode` **L2119**. The reconciliation line is informational and shows for **both** roles (no gating; matches the rollup's own "SM count/lock unaffected" stance).
- Helpers to reuse: `_el()` (used L1603), `esc()` (used L1525), CSS vars `--green/--amber/--gray-400`, `stVar()`/`stEsc()` in the print path (used L2626/L2629).

**`V:/Co work/Projects/Retail/_extracted_modules/dsr.html`** (reference only — NOT edited)
- Sale-row shapes: manual `saveSale` **L2391** `{billNo, product, amount:+amount, customer, mobile, paymentMode}`; qms-visitor push **L2279–2283** `{billNo:'', amount:'', type:'sale', source:'qms-visitor', _confirmed:false}`; bridge QMS push (integration-bridge.js **L219**) `{amount, type:'sale'|'service', source:'qms', _confirmed:false}`.
- Confirmed-bill convention: EOD grouping counts only `Number(s.amount)>0` (**L1849**); audit scoring likewise (**L2962** "only confirmed (amount>0) bills score").
- `blankRecord` **L1545–1559** — **no `store` field is ever persisted** on a DSR record, so the bridge's `r.store||r.storeCode` at L322 is always empty today and everything buckets into WLMHW. Store must come from the employee master: `staffStore()` **L1400–1408** (field `store` = `'Titan World'|'Helios'`, the `PROD_GROUPS[].short` values **L1373/L1379**; demo-seed.js **L53/L71** confirms those exact strings).

---

## Additive-safe — TRUE

- Bridge adds one **optional** numeric field inside an object it already owns and writes (`_dsrRollup`), on an existing key, via the existing single `S(sk,sb)` write — no rename/reshape, no new keys, no new writes.
- Stock changes are **render-only** (one HTML container + one render function + one print line). Stock authors **no** new persisted fields. Old bridge + new stock → line absent (salesCount missing). New bridge + old stock → extra field ignored (stock never read `_dsrRollup` before).
- The store-resolution refinement at L322 only changes where the **informational** rollup lands (Helios CROs previously mis-bucketed into WLMHW); no module has ever read `_dsrRollup` until this feature, so there are no downstream readers to break. `openingTotal/closingTotal/cros/source/note/at` keep their exact existing semantics.

## Approach (step-by-step)

### Step 1 — bridge: store resolver + day-wide salesCount recompute (integration-bridge.js)

Why recompute instead of summing inside the `consume()` callback: `agg` starts at zero **each cycle** and the writer overwrites `_dsrRollup` with only that batch (existing quirk of openingTotal/closingTotal). If CRO A submits at 10:00 and CRO B at 18:00, the final rollup would hold only B's sales → false mismatch. A full recompute over all of today's submitted DSR records is idempotent, covers staggered submits, and makes P1-12 `:v<rev>` re-submits self-correcting (no double count — it is never an increment).

Add two helpers near `dsrKey()` (~L196), then edit `consumeDsrToStock`:

```js
/* P1-8: resolve a DSR record's store CODE. DSR records persist no store field
   (dsr.html blankRecord), so r.store||r.storeCode is empty today and everything
   bucketed WLMHW. Consult the employee master (same source dsr.html staffStore()
   uses; store = 'Titan World'|'Helios'). Fallback unchanged: WLMHW. */
function dsrStoreCode(r){
  var s=String((r&&(r.store||r.storeCode))||'').toUpperCase();
  if(s==='WLMHW'||s==='HEMW') return s;
  var who=kk(r&&r.staffName);
  if(who){ var em=L(EMP_MASTER,[])||[];
    for(var i=0;i<em.length;i++){ var e=em[i];
      if(e&&e.active!==false&&kk(e.name)===who){
        var st2=kk(e.store);
        if(st2.indexOf('helios')>=0) return 'HEMW';
        if(st2.indexOf('titan')>=0)  return 'WLMHW';
        break; } } }
  return 'WLMHW';
}
/* P1-8: units sold per the DSR for one store/day, recomputed from ALL of that day's
   SUBMITTED records (not just this consume batch) so staggered multi-CRO submits and
   P1-12 corrected re-submits never double- or under-count. A "sale" = a confirmed
   product bill: Number(amount)>0 (dsr.html's own confirmed-bill convention, L1849/L2962)
   and not a QMS service job (type!=='service'). NOTE: DSR has no qty per bill, so this
   counts BILLS — copy in stock says so. */
function dsrDaySales(date,code){
  var n=0, pre=DSR+date+'_';                    // DSR='saagar_dsr_' (L32); 'saagar_dsr_staff' can't match
  for(var i=0;i<localStorage.length;i++){
    var k=localStorage.key(i); if(!k||k.indexOf(pre)!==0) continue;
    var r=L(k,null); if(!r||r.submitted!==true) continue;   // excludes _bridgeCreated stubs too
    if(dsrStoreCode(r)!==code) continue;
    var arr=Array.isArray(r.sales)?r.sales:[];
    for(var j=0;j<arr.length;j++){ var s2=arr[j];
      if(s2 && s2.type!=='service' && (Number(s2.amount)||0)>0) n++; }
  }
  return n;
}
```

Edit `consumeDsrToStock` (L317–332) — two lines change:

```js
// L322 was: var st=(r.store||r.storeCode||'WLMHW').toUpperCase(), b=agg[st]||agg.WLMHW;
var b=agg[dsrStoreCode(r)];   // P1-8: same resolver as salesCount so bucket + count agree

// L329 rollup write gains ONE field (everything else byte-identical):
sb._dsrRollup={openingTotal:agg[sc].open,closingTotal:agg[sc].close,cros:agg[sc].cros,source:'dsr',
  salesCount:dsrDaySales(d,sc),   /* P1-8: units (bills) sold per submitted DSRs, day-wide recompute */
  note:'Auto roll-up from DSR — informational; SM count/lock unaffected',at:new Date().toISOString()};
```

The scan runs only inside `if(touched)` per store with new submits (≤2 stores × one localStorage pass) — bounded, no idle cost. Writes ONLY the existing stock day key; nothing to do with `saagar_exceptions`/`buildExceptions` (L524) in this item.

### Step 2 — stock.html: reconciliation container (HTML)

After **L640** `<div class="scards" id="sum-cards"></div>` add:

```html
<div id="sum-dsr-recon" style="display:none"></div>
```

### Step 3 — stock.html: render the line (renderSummary)

New function next to `renderSummary()`; call it as the last statement before `applyReadOnlyChrome()` at **L1560**, i.e. `renderDsrRecon(data, tSales);`. In the empty-brands early return (**L1479–1485**) add `_el('sum-dsr-recon', el => { el.innerHTML=''; el.style.display='none'; });` before `return`.

```js
/* P1-8: one DSR cross-check line under the summary cards. Renders ONLY when the bridge
   has written _dsrRollup.salesCount for this day; legacy rollups (pre-Wave-9), days with
   no submitted DSR, or bridge-off installs have no salesCount → line absent. Numbers are
   Number()-coerced, so junk injected via import can never reach the DOM as markup. */
function renderDsrRecon(data, tSales) {
  const box = document.getElementById('sum-dsr-recon');
  if (!box) return;
  const ru   = data && data._dsrRollup;
  const dsrN = ru ? Number(ru.salesCount) : NaN;
  if (!ru || !Number.isFinite(dsrN) || dsrN < 0) { box.innerHTML=''; box.style.display='none'; return; }
  const stockN = Number(tSales) || 0;
  const anyEntered = getBrands(st.store).some(b => {
    const m = data.movements[b] || {}; return m.sales !== null && m.sales !== undefined;
  });
  const tip = 'DSR figure counts confirmed billed sales (amount > 0, service jobs excluded) from submitted DSRs — informational auto roll-up; SM count/lock unaffected.';
  let inner;
  if (!anyEntered && dsrN > 0) {
    inner = `<span style="color:var(--gray-400);font-weight:600">DSR sales ${dsrN} — Stock “Sales” column not entered yet</span>`;
  } else if (stockN === dsrN) {
    inner = `<span style="color:var(--green);font-weight:600">✓ Stock sales ${stockN} vs DSR sales ${dsrN} — OK</span>`;
  } else {
    const df = stockN - dsrN;
    inner = `<span style="color:var(--amber);font-weight:700">⚠ Stock sales ${stockN} vs DSR sales ${dsrN} — mismatch (${df>0?'+':''}${df})</span>`;
  }
  box.style.display = '';
  box.innerHTML = `<div title="${tip}" style="margin:2px 0 12px;font-size:12px">${inner}</div>`;
}
```

Inline styles with CSS vars mirror the existing status spans in `renderSummary` (L1512/L1515/L1518). No role gating (`st.mode` irrelevant — informational for CRO and SM alike). `data._dsrRollup.note` is deliberately **not** rendered (bridge/import-written string; our copy is hard-coded instead — no `esc()` exposure at all since only coerced numbers are interpolated).

### Step 4 — stock.html: parity line in the A4 print (printSummaryReg)

Inside the `else` branch after the `stp-cards` block (**after L2651**):

```js
/* P1-8: same cross-check on the printed register */
const _ru = data._dsrRollup, _dsrN = _ru ? Number(_ru.salesCount) : NaN;
if (Number.isFinite(_dsrN) && _dsrN >= 0) {
  body += '<div style="margin:6px 0 10px;font:600 11px Arial,sans-serif">Cross-check: Stock sales '
    + tSales + ' vs DSR sales ' + _dsrN + ' — '
    + (tSales === _dsrN ? 'OK' : 'MISMATCH (' + stVar(tSales - _dsrN) + ')') + '</div>';
}
```

### Step 5 — re-embed stock.html into the shell blob via the established pipeline (scratchpad p1plan/embed.js precedent); integration-bridge.js ships as-is (plain file).

---

## Data model & CARRY analysis

**New persisted field (exactly one, bridge-authored):**

| Field | Where | Type | Default | Written by |
|---|---|---|---|---|
| `salesCount` | inside `_dsrRollup` on `saagar_stock_<titanworld|helios>_<date>` | integer ≥ 0 | **absent** (undefined) | bridge `consumeDsrToStock` only |

**New localStorage keys: none.** Stock authors no new fields; the module never writes `_dsrRollup` (it only survives module saves because `saveData()` L1008 stringifies the whole loaded object).

**CARRY verification for `_dsrRollup` (required by the item — VERIFIED, no edit needed):**
- `loadData()` **L943–959** parses the raw blob and returns it (only per-brand `countDone` back-fill) → `_dsrRollup` intact in memory; every `saveData()` **L1008** persists it back. So normal day-to-day module use never drops it.
- `exportJSON()` **L2343** serialises `loadData()` → `_dsrRollup` included in single-day exports; `exportAllJSON()` **L2349** copies raw keys → included.
- **Import round-trip:** `validateImportSchema` (ends **L2235**) checks only opening/movements/closing/locks — unknown top-level keys are not rejected. `normaliseImportData()` **L2238–2287** takes `const d = parsed.data` (**L2242**) and mutates **in place**: it rebuilds only `d.opening[b]` (L2249), `d.movements[b]` (L2262), `d.closing[b]` (L2270) per brand and coerces the four top-level flags (L2282–2285), then `return parsed` (L2286). It never rebuilds the top-level object and never deletes unknown keys ⇒ **`_dsrRollup` (with `salesCount`) is carried implicitly on import**. Both import paths (`importJSON` single-record L2301–2308 and full-backup L2310–2328) go through this same function. **No carry edit required** — but the Wave-9 implementer adding OTHER new stock fields in `normaliseImportData` must not "tidy" it into a rebuild-from-scratch, which WOULD drop `_dsrRollup`; keep the in-place pattern.
- Consequence of no validation: an imported blob can carry an arbitrary `_dsrRollup` — the renderer therefore `Number()`-coerces and hides on non-finite (Step 3), and never interpolates rollup strings.

## UI (where + exact copy)

Summary tab, directly under the summary cards (`#sum-cards`, L640), one 12px line, both roles, also visible when viewing past days (read-only render):
- Match (green ✓): `✓ Stock sales 14 vs DSR sales 14 — OK`
- Mismatch (amber ⚠, weight 700): `⚠ Stock sales 14 vs DSR sales 12 — mismatch (+2)` (delta = stock − DSR, signed)
- Sales column untouched while DSR>0 (gray, no false alarm): `DSR sales 12 — Stock “Sales” column not entered yet`
- Tooltip (title attr) on the line: `DSR figure counts confirmed billed sales (amount > 0, service jobs excluded) from submitted DSRs — informational auto roll-up; SM count/lock unaffected.`
- A4 print (printSummaryReg), under the cards: `Cross-check: Stock sales 14 vs DSR sales 12 — MISMATCH (+2)` / `— OK`
- Absent entirely (container `display:none`) when `_dsrRollup` or a finite `salesCount` is missing.
Counts are unit integers, rendered raw (matching `tSales` in the existing cards); `toLocaleString('en-IN')` is a rupee convention and does not apply.

## Edge cases

1. **Legacy rollup (pre-Wave-9)** — `_dsrRollup` exists but no `salesCount` → `Number(undefined)=NaN` → line absent.
2. **No rollup at all** (no DSR submits that day, bridge disabled, fresh install) → line absent.
3. **P1-12 corrected re-submit** (`:v<rev>` event, producer L146–150) → consumer fires again → full recompute → corrected sales reflected; recompute (not increment) ⇒ no double count.
4. **Staggered multi-CRO submits** — `salesCount` covers ALL submitted records at each write; `openingTotal/closingTotal` keep their pre-existing last-batch behaviour (documented quirk, deliberately untouched).
5. **Service rows** (bridge QMS push `type:'service'`, L219) and **unconfirmed qms-visitor placeholders** (`amount:''` → 0) are excluded — they don't move watch stock / aren't billed yet.
6. **Bills vs units** — DSR has no qty per bill; a 2-watch bill counts 1. Hence amber (advisory) not red, and the tooltip says "billed sales".
7. **CRO missing from employee master / unrecognised store text** → `dsrStoreCode` falls back to WLMHW (exactly today's behaviour); their sales land in titanworld's line.
8. **Helios day with no Helios-mapped submits** → no helios rollup written (existing `if(!agg[sc].cros.length) return;` L327) → helios Summary shows no line.
9. **Imported junk** `salesCount:'"><img…'` → NaN → hidden; numeric string `'12'` renders as 12. Only coerced numbers reach the DOM.
10. **Past-day view** — line renders from that day's stored blob, read-only (`isPastView()` writes nothing); days before Wave-9 simply have no salesCount.
11. **Midnight straggler** — DSR submitted 23:59, cycle at 00:01: existing date gate (L320) consumes it without rollup; salesCount inherits this pre-existing bound (today-only rollups).
12. **Zero brands** for a store → early return clears/hides `#sum-dsr-recon`.
13. **`agg[dsrStoreCode(r)]` is always defined** — resolver returns only 'WLMHW'|'HEMW', both seeded at L318 (the old `agg[st]||agg.WLMHW` guard is preserved by construction).

## Verify (browser harness; module state is block-scoped → drive via `moduleFrame.contentWindow.eval`)

Setup in the SHELL page console (bridge runs in shell scope), `D` = today `YYYY-MM-DD`:
```js
localStorage.setItem('saagar_employee_master_v1', JSON.stringify([
  {name:'Recon Tester', store:'Titan World', active:true},
  {name:'Helio Tester', store:'Helios',      active:true}]));
localStorage.setItem('saagar_dsr_'+D+'_Recon_Tester', JSON.stringify({date:D,staffName:'Recon Tester',role:'CRO',submitted:true,submitRev:0,opening:{},closing:{},sales:[
  {billNo:'1',product:'TITAN',amount:5000},
  {billNo:'2',product:'FASTRACK',amount:3000},
  {billNo:'',product:'TITAN',amount:'',type:'sale',source:'qms-visitor',_confirmed:false},
  {billNo:'9',product:'Service',amount:400,type:'service',source:'qms'}],nonpurch:[]}));
window.SaagarBridge.runNow();
```
1. **Contract:** `JSON.parse(localStorage.getItem('saagar_stock_titanworld_'+D))._dsrRollup.salesCount === 2` (service + blank-amount rows excluded) and `.at` is a fresh ISO stamp.
2. **OK line:** open Stock → `const f=document.getElementById('moduleFrame').contentWindow;` then `f.eval("(function(){var d=loadData(),b=getBrands(st.store);d.movements[b[0]].sales=2;saveData(d);goTab('summary');return document.getElementById('sum-dsr-recon').textContent;})()")` → contains `Stock sales 2 vs DSR sales 2 — OK`.
3. **Mismatch line:** same with `sales=3` → contains `Stock sales 3 vs DSR sales 2 — mismatch (+1)`; assert amber: `f.eval("getComputedStyle(document.querySelector('#sum-dsr-recon span')).color")` equals the resolved `--amber`.
4. **Not-entered variant:** set all `movements[b].sales=null` → text contains `not entered yet`.
5. **Graceful absence:** in shell, delete the field — `var sb=JSON.parse(localStorage.getItem('saagar_stock_titanworld_'+D)); delete sb._dsrRollup.salesCount; localStorage.setItem(...)` → `f.eval("goTab('summary'),document.getElementById('sum-dsr-recon').style.display")` === `'none'`. Repeat with `_dsrRollup` removed entirely.
6. **Re-submit recompute:** edit the DSR record to one amount>0 row, set `submitRev:1`, `SaagarBridge.runNow()` → `salesCount === 1` (event id `DSR_SUBMITTED:<D>:recon tester:v1` visible via `SaagarBridge.events('DSR_SUBMITTED')`).
7. **Store attribution:** seed `saagar_dsr_<D>_Helio_Tester` (submitted, 1 confirmed sale), `runNow()` → `saagar_stock_helios_<D>` gets `_dsrRollup.salesCount===1` and titanworld's stays 2 (helios rollup only exists after this — asserts the resolver).
8. **CARRY round-trip (in module):** `f.eval("(function(){var raw=JSON.parse(localStorage.getItem(dataKey()));var n=normaliseImportData({store:st.store,date:st.date,data:JSON.parse(JSON.stringify(raw))});return n.data._dsrRollup&&n.data._dsrRollup.salesCount;})()")` === 2.
9. **XSS guard:** set `salesCount:'\"&gt;&lt;img src=x onerror=alert(1)&gt;'` in the blob → line hidden, no markup injected (`#sum-dsr-recon` innerHTML empty).
10. **Print parity:** with mismatch state, `printSummaryReg()` output body contains `Cross-check: Stock sales 3 vs DSR sales 2 — MISMATCH (+1)` (inspect the generated body string via the stPrintDoc path or the print window DOM).
11. **Regression:** cards/table totals unchanged (`tSales` untouched); harness console shows 0 errors across tab switches, store switch, past-date view.

## Risk & blast radius

- **Touched:** `consumeDsrToStock` + two new bridge helpers (one function's blast radius; rollup remains informational and is read by nothing except the new stock line); stock.html gains one div + one render function + one call + one print line. No exceptions-hub, no `saagar_exceptions`, no other modules, never touches storage-core.js/sqlite-store.js/photo-store.js.
- **Perf:** localStorage scan only inside `if(touched)` on DSR-submit cycles (≤2 stores, one pass each); idle cycles unchanged (no new writes → no whole-DB persist burst).
- **Pre-existing, unfixed here (documented):** the bridge/stock whole-blob RMW race on the day key (docs/audit bugs/bug-stock.md `stock-bridge-rollup-race`, P2) — this item adds zero extra writes beyond the existing single `S(sk,sb)`; and `openingTotal/closingTotal` last-batch semantics.
- **Behaviour change knowingly accepted:** informational rollup for employee-master-mapped Helios CROs now lands in the helios blob instead of (wrongly) titanworld's. No existing reader — first-ever reader is this feature.
- **Worst failure mode:** a wrong `salesCount` produces a wrong amber advisory line; SM counts, locks, movements and all authoritative stock data are unaffected by construction (render-only).