# P1-7

SUMMARY: P1-7 gates theft through two composable pre-checks: (1) submitMovements() opens a per-brand remark sheet (mirroring the existing pre-lock variance sheet) whenever any movements row has theft>0 without a theftRemark — theft==0 days take today's exact code path with only one cheap array scan added; (2) doLockClosing() refuses to lock while theft is unverified, stamping data.theftVerified={by,at} from an SM-only checkbox added to the existing pre-lock sheet, so legacy remark-less days lock gracefully via a one-tick verify. The bridge's buildExceptions() gains a 7-day-lookback high-severity 'Stock' exception for unlocked days with theft>0 and no theftVerified stamp, reading only existing fields plus the new theftVerified, writing only saagar_exceptions.

NEW FIELDS: [
 {
  "field": "theftRemark",
  "where": "movements[brand] row inside the stock day blob localStorage key saagar_stock_<titanworld|helios>_<YYYY-MM-DD> (same row object as inward/outward/sales/grn/theft)",
  "type": "string",
  "default": "'' (empty string) — defaulted in normaliseImportData movements rebuild (stock.html ~2262-2268), initData() (~966), and addBrand() (~2174); all reads use (m.theftRemark||'').trim() so undefined on legacy blobs is safe"
 },
 {
  "field": "theftVerified",
  "where": "top level of the stock day blob (same level as openingLocked/closingLocked/movementsSubmitted/closingSignoff)",
  "type": "object {by:string, at:ISO-string} | null",
  "default": "null — shape-validated + defaulted in normaliseImportData day-level pass (stock.html after ~2285); written ONLY by doLockClosing(); cleared by updMov() when a theft figure changes"
 }
]

NEW KEYS: []

BRIDGE CONTRACT: integration-bridge.js buildExceptions() (line ~524) adds one read-only block after the existing stock-not-locked check (lines 540-543). For each store code ['WLMHW','HEMW'] and each of the last 7 days (today included), it reads L('saagar_stock_'+skey(sc)+'_'+dd, null) and inspects EXACTLY these fields: sb.closingLocked (existing bool — true ⇒ skip, which exempts pre-feature legacy locked days), sb.theftVerified (NEW — truthy .by ⇒ skip), sb.movements[brand].theft (existing number|null — summed), and sb.movementsSubmitted (existing bool — for dd===today the flag fires only when true, so a mid-entry day never nags; past days fire regardless). When theft units>0 and unverified it pushes {sev:'high', area:'Stock', msg:sc+' theft '+tu+' unit(s) on '+dd+' not SM-verified — verify & lock closing', at:dd} into the ex array, persisted via the EXISTING S(EXC,...) — the only localStorage write stays saagar_exceptions. area:'Stock' is already mapped to the stock module by EXC_AREA_TO_MODULE (www/index.html:3013) so the hub's Fix button needs no shell change. Stock's side of the contract: doLockClosing() is the sole writer of theftVerified={by,at}; updMov() nulls it on any theft change.

# P1-7 — Theft entries require a remark + SM verify before lock

**Effort S · MED RISK** (new Submit/Lock gate — theft==0 flow must stay byte-identical in behaviour)

## Target

| File | Function / anchor | Lines (current) | Change |
|---|---|---|---|
| `_extracted_modules/stock.html` | `#stock-lock-confirm` modal HTML | 787–800 | add `<div id=\"clk-theft\"></div>` between `#clk-summary` (792) and `#clk-gaps` (793); add new sibling modal `#stock-theft-confirm` after line 800 |
| `_extracted_modules/stock.html` | `initData()` | 962, 966 | add `theftVerified:null` to day blob; `theftRemark:''` to movements row |
| `_extracted_modules/stock.html` | `updMov()` | 1664–1708 (insert after 1695) | clear `theftVerified` when a theft figure changes |
| `_extracted_modules/stock.html` | `renderSummary()` | 1473, theft scard 1554 | scard sub shows verify status when theft>0 |
| `_extracted_modules/stock.html` | new helpers `theftRows()` / `smName()` | insert before `preLockClosing` (~1878) | shared by submit gate, lock gate |
| `_extracted_modules/stock.html` | `openPreLockSheet()` | 1893–1922 | render theft-verify section into `#clk-theft` |
| `_extracted_modules/stock.html` | `clkValidate()` | 1925–1938 | also require `#clk-theft-cb` ticked |
| `_extracted_modules/stock.html` | `doLockClosing()` | 1946–1981 (insert after guard at 1955–1958) | PRE-CHECK: block lock until verified; stamp `theftVerified` |
| `_extracted_modules/stock.html` | `submitMovements()` | 1994–2004 | PRE-CHECK: theft>0 without remark → open theft sheet, don't submit |
| `_extracted_modules/stock.html` | new fns `openTheftSheet/thfValidate/theftSheetCancel/doSubmitTheftRemarks` | insert after `submitMovements` (~2004) | the remark sheet |
| `_extracted_modules/stock.html` | `renderMovementsHeader()` | 2029–2042 (info text 2039–2041) | submitted info bar notes pending SM verify when theft>0 |
| `_extracted_modules/stock.html` | `normaliseImportData()` | 2238–2287 (movements 2262–2268, day flags 2283–2285) | **CARRY** both new fields (one Wave-9 pass with the other items' fields) |
| `_extracted_modules/stock.html` | `addBrand()` | 2174 | new-brand movements row includes `theftRemark:''` |
| `www/integration-bridge.js` | `buildExceptions()` | 524–571 (insert after stock block 540–543) | high-sev exception for unverified theft days (7-day lookback) |

Role gate facts used: SM = `st.mode==='sm'` (state line 864), granted only via `smAuthSubmit()`→`smPassOk()` (870–877, shell-Admin-PIN-backed) through `setMode('sm')` (2086). `toggleLock`/`doLockClosing` already hard-guard `st.mode !== 'sm'` (1858, 1948). CROs CAN call `submitMovements()` (no mode guard, line 1994) — intended; the remark is typed by whoever submits. Attribution name for the stamp: shell key `saagar_active_staff_v1` (`{id,name,employeeId,at}` — www/index.html:1982, 2197), read best-effort, fallback `'SM'`.

## Additive-safe — TRUE

- Two new **optional** fields only (`theftRemark` on the movements row, `theftVerified` on the day blob). No key renamed/reshaped; `validateImportSchema` (2222) already passes unknown fields; `exportJSON` (2343) exports `loadData()` wholesale so both ride along.
- theft==0 days: `submitMovements` adds one array scan that yields `[]` → falls through to today's exact lines; `openPreLockSheet` renders an empty `#clk-theft`; `clkValidate` finds no `#clk-theft-cb` → same result as today; `doLockClosing` PRE-CHECK short-circuits on `tr.length===0`. Zero added friction, zero new prompts.
- Legacy days (theft>0, no remark, possibly already `movementsSubmitted`): remark is enforced **only at submit time**, so a legacy already-submitted day never needs a remark; the lock sheet shows “No remark (recorded before this update)” and asks SM for the one-tick verify. Legacy days already **locked** pre-feature are untouched and exempt from the bridge exception (`closingLocked===true` skips).
- Bridge block is read-only over stock blobs and writes only `saagar_exceptions` via the existing `S(EXC,…)` call — hard rule respected.
- P1-5 compose note honoured: the theft gate in `doLockClosing` is a PRE-CHECK inserted immediately after the existing missing-remark guard (1955–1958), **before any mutation**; P1-5's lock-stamp lines can land after it in the same function and share the single `saveData(data)`.

## Approach

### 1 · Shared helpers (insert before `preLockClosing`, ~1878)

```js
/* P1-7: brands with theft units on the loaded day blob */
function theftRows(data) {
  return getBrands(st.store).map(b => {
    const m = data.movements[b] || {};
    return { brand: b, units: m.theft ?? 0, remark: (m.theftRemark || '').trim() };
  }).filter(r => r.units > 0);
}
/* P1-7: attribution for the verify stamp — shell signed-in staff, else 'SM' */
function smName() {
  try { const a = JSON.parse(localStorage.getItem('saagar_active_staff_v1') || 'null');
        if (a && a.name) return String(a.name); } catch(e) {}
  return 'SM';
}
```

### 2 · Submit gate — `submitMovements()` (1994)

```js
function submitMovements() {
  if (roBlock()) return;                       // unchanged
  const data = loadData();
  const missing = theftRows(data).filter(r => !r.remark);   // P1-7 PRE-CHECK
  if (missing.length) { openTheftSheet(theftRows(data)); return; }  // no submit yet
  data.movementsSubmitted = true;              // ← everything below unchanged
  saveData(data);
  updateClosingTabState(data);
  renderMovementsHeader(data);
  toast('Day Movements submitted ✓ Closing Stock is now unlocked.', 'ok');
  setTimeout(() => goTab('closing'), 700);
}
```

**Per-row (per-brand) remark, collected in a sheet — justification:** (a) one day's theft can span several brands with different incidents, so a per-day remark under-explains; (b) the module already has this exact interaction for closing variances (`openPreLockSheet` gapRows + `clkValidate`, 1893–1938) — copying it keeps UX consistent and implementation low-risk; (c) a sheet means **no new table column**, so the 7-column movements grid, its mobile card CSS (~406), `emptyStateRow(7)` (1316) and the print/CSV builders are untouched → the theft==0 flow sees zero UI change.

### 3 · Theft remark sheet (new modal after line 800 + fns after `submitMovements`)

```html
<!-- ══ THEFT REMARK SHEET (P1-7 — movements submit gate) ══ -->
<div id=\"stock-theft-confirm\" class=\"modal-overlay\" style=\"display:none\" onclick=\"if(event.target===this)theftSheetCancel()\">
  <div class=\"modal-box\">
    <div class=\"modal-icon\">🚨</div>
    <h3>Theft / Loss — Remark Required</h3>
    <p style=\"margin-bottom:10px;\">Theft reduces closing stock. Enter a reason for each brand before submitting Day Movements.</p>
    <div id=\"thf-rows\"></div>
    <div class=\"modal-err\" id=\"thf-err\"></div>
    <div class=\"modal-btns\">
      <button class=\"btn btn-navy btn-sm\" id=\"thf-confirm-btn\" onclick=\"doSubmitTheftRemarks()\">Submit with Remarks</button>
      <button class=\"btn btn-outline btn-sm\" onclick=\"theftSheetCancel()\">Back</button>
    </div>
  </div>
</div>
```

```js
function openTheftSheet(rows) {
  document.getElementById('thf-rows').innerHTML = rows.map(r => `
    <div class=\"clk-gap-row\">
      <div class=\"clk-gap-head\"><span class=\"clk-gap-name\">${esc(r.brand)}</span>
        <span style=\"color:var(--red);font-weight:700\">${r.units} unit${r.units===1?'':'s'}</span></div>
      <input type=\"text\" class=\"si thf-remark\" data-brand-id=\"${esc(bid(r.brand))}\"
        placeholder=\"Reason / incident detail (required)\" value=\"${esc(r.remark)}\" oninput=\"thfValidate()\">
    </div>`).join('');
  document.getElementById('thf-err').textContent = '';
  document.getElementById('stock-theft-confirm').style.display = 'flex';
  thfValidate();
}
function thfValidate() {
  const inputs  = Array.from(document.querySelectorAll('#stock-theft-confirm .thf-remark'));
  const missing = inputs.filter(i => !i.value.trim()).map(i => getBrandByBid(i.getAttribute('data-brand-id')));
  const btn = document.getElementById('thf-confirm-btn'), err = document.getElementById('thf-err');
  if (btn) btn.disabled = missing.length > 0;
  if (err) err.textContent = missing.length ? 'Enter a remark for: ' + missing.join(', ') : '';
}
function theftSheetCancel() { document.getElementById('stock-theft-confirm').style.display = 'none'; }
function doSubmitTheftRemarks() {
  if (roBlock()) { theftSheetCancel(); return; }
  const data   = loadData();                    // fresh — mirrors doLockClosing (1949)
  const inputs = Array.from(document.querySelectorAll('#stock-theft-confirm .thf-remark'));
  if (inputs.some(i => !i.value.trim())) { thfValidate(); return; }   // belt-and-braces
  inputs.forEach(i => {
    const brand = getBrandByBid(i.getAttribute('data-brand-id'));
    if (data.movements[brand]) data.movements[brand].theftRemark = i.value.trim();
  });
  saveData(data);
  theftSheetCancel();
  submitMovements();   // re-runs the gate; now clean → single submit path preserved
}
```

### 4 · Lock gate — pre-lock sheet + `doLockClosing`

`openPreLockSheet()` (1893), after the gaps block (1903–1918), render into the new `#clk-theft` div:

```js
// P1-7: theft verification section (SM-only sheet — mode already guarded at 1895)
const tEl = document.getElementById('clk-theft');
const tr  = theftRows(data);
if (!tr.length) { tEl.innerHTML = ''; }
else if (data.theftVerified && data.theftVerified.by) {
  tEl.innerHTML = `<p style=\"margin:0 0 8px;color:var(--green);font-weight:600;\">✓ Theft verified by ${esc(data.theftVerified.by)} · ${esc(String(data.theftVerified.at).slice(11,16))}</p>`;
} else {
  tEl.innerHTML =
    '<p style=\"margin:0 0 8px;color:var(--red);font-weight:600;\">Theft recorded today — SM verification required:</p>' +
    tr.map(r => `<div class=\"clk-gap-row\"><div class=\"clk-gap-head\">
        <span class=\"clk-gap-name\">${esc(r.brand)}</span>
        <span style=\"color:var(--red);font-weight:700\">${r.units} unit${r.units===1?'':'s'}</span></div>
      <div style=\"font-size:12px;color:var(--gray-600);\">${r.remark ? esc(r.remark) : '<em>No remark (recorded before this update)</em>'}</div>
    </div>`).join('') +
    `<label style=\"display:flex;align-items:center;gap:8px;margin-top:8px;font-weight:600;color:var(--navy);\">
       <input type=\"checkbox\" id=\"clk-theft-cb\" onchange=\"clkValidate()\"> I have verified these theft entries (SM)
     </label>`;
}
```

`clkValidate()` (1925) — compose both conditions (checkbox absent ⇒ no theft pending ⇒ today's behaviour):

```js
function clkValidate() {
  const inputs  = Array.from(document.querySelectorAll('#stock-lock-confirm .clk-remark'));
  const missing = inputs.filter(inp => !inp.value.trim())
                        .map(inp => getBrandByBid(inp.getAttribute('data-brand-id')));
  const cb = document.getElementById('clk-theft-cb');   // P1-7: null when no theft / already verified
  const theftPending = !!cb && !cb.checked;
  const btn = document.getElementById('clk-confirm-btn');
  const err = document.getElementById('clk-err');
  if (btn) btn.disabled = missing.length > 0 || theftPending;
  if (err) err.textContent = missing.length ? 'Enter a reason for: ' + missing.join(', ')
                  : theftPending ? 'Tick the theft verification box to proceed.' : '';
}
```

`doLockClosing()` (1946) — insert PRE-CHECK right after the missing-gap guard (1955–1958), before the gapRemarks loop, so it runs before ANY mutation and P1-5's stamp composes after it in the same single `saveData`:

```js
// P1-7 PRE-CHECK: day cannot lock while theft is unverified (legacy remark-less rows verify here too)
const _tr = theftRows(data);
if (_tr.length && !(data.theftVerified && data.theftVerified.by)) {
  const cb = document.getElementById('clk-theft-cb');
  if (!cb || !cb.checked) {
    document.getElementById('clk-err').textContent = 'Tick the theft verification box to proceed.';
    return;
  }
  data.theftVerified = { by: smName(), at: new Date().toISOString() };   // SM guaranteed by guard at 1948
}
```

### 5 · Stamp invalidation — `updMov()` (insert after `m[field] = newVal;` line 1695)

```js
// P1-7: changing a theft figure invalidates the SM verification stamp
if (field === 'theft' && prev !== newVal && data.theftVerified) {
  data.theftVerified = null;
  toast('Theft changed — SM verification reset. Verify again at closing lock.', 'warn');
}
```
(Movements are input-locked once submitted — 1309/1341 — so this only fires pre-submit or after an SM `reopenMovements()`, exactly the cases where re-verification is wanted. `reopenMovements` itself needs NO change.)

### 6 · Surfacing (2 one-liners)

- `renderSummary()` theft scard (1554): sub becomes `${tTheft>0 ? (data.theftVerified&&data.theftVerified.by ? '✓ SM verified' : '⚠ Awaiting SM verify') : 'Shrinkage'}` (`data` is in scope, 1474).
- `renderMovementsHeader()` submitted text (2039–2041): append when theft present — `const tUnits = getBrands(st.store).reduce((s,b)=>s+((data.movements[b]||{}).theft??0),0);` then `+ (tUnits>0 ? ' <strong>Theft recorded</strong> — SM verifies at closing lock.' : '')` on the submitted branch.

### 7 · Bridge — `buildExceptions()` (integration-bridge.js, insert after lines 540–543)

```js
// P1-7: unverified theft days — HIGH. Reads sb.movements[*].theft + sb.theftVerified {by,at}
// (stamped by stock doLockClosing). closingLocked===true skips ⇒ pre-feature locked days exempt.
// Today only nags after movements submit; past unlocked days nag regardless. 7-day lookback.
try{
  function dMinus(s,n){var t=new Date(s+'T00:00:00');t.setDate(t.getDate()-n);
    function p(x){return(x<10?'0':'')+x;}return t.getFullYear()+'-'+p(t.getMonth()+1)+'-'+p(t.getDate());}
  ['WLMHW','HEMW'].forEach(function(sc){
    for(var back=0;back<7;back++){
      var dd=dMinus(d,back), sb=L('saagar_stock_'+skey(sc)+'_'+dd,null);
      if(!sb||typeof sb!=='object'||!sb.movements) continue;
      if(sb.closingLocked===true) continue;
      if(sb.theftVerified&&sb.theftVerified.by) continue;
      if(back===0&&sb.movementsSubmitted!==true) continue;   // mid-entry today: no noise yet
      var tu=0; Object.keys(sb.movements).forEach(function(b){var m=sb.movements[b]; tu+=(m&&Number(m.theft))||0;});
      if(tu>0) ex.push({sev:'high',area:'Stock',msg:sc+' theft '+tu+' unit(s) on '+dd+' not SM-verified — verify & lock closing',at:dd});
    }
  });
}catch(e){}
```
Item shape `{sev,area,msg,at}` matches every existing item (527–566); the existing sort (568) and `S(EXC,…)` (569) are reused — **no other localStorage write**. `area:'Stock'` already routes the hub's Fix button to the stock module (`EXC_AREA_TO_MODULE`, www/index.html:3013); high sev is prepended red in the attention list (index.html:3257–3264). Cost: ≤14 `L()` reads per 60-s tick.

## Data model & CARRY analysis

**New localStorage keys: NONE.** Both fields live inside the existing per-day blob `saagar_stock_<titanworld|helios>_<YYYY-MM-DD>`; the bridge writes only the existing `saagar_exceptions`.

| Field | Where | Type | Default | Written by | Read by |
|---|---|---|---|---|---|
| `theftRemark` | `movements[brand]` row | string | `''` | `doSubmitTheftRemarks()` | submit gate, pre-lock sheet, bridge (not needed), all defensively via `(m.theftRemark||'')` |
| `theftVerified` | day blob top level | `{by:string, at:ISO}` \| `null` | `null` | `doLockClosing()` only; nulled by `updMov()` | lock gate, `renderSummary`, bridge `buildExceptions` |

**normaliseImportData (stock.html 2238) — THE carry-trap.** The movements rebuild (2262–2268) is a wholesale object literal: without an explicit carry, an import would silently DROP `theftRemark`. Add in the SAME single Wave-9 pass as the other items' fields:

```js
const m = d.movements[b];
d.movements[b] = {
  inward:  parseStockInt(m.inward)  ?? null,
  outward: parseStockInt(m.outward) ?? null,
  sales:   parseStockInt(m.sales)   ?? null,
  grn:     parseStockInt(m.grn)     ?? null,
  theft:   parseStockInt(m.theft)   ?? null,
  theftRemark: typeof m.theftRemark === 'string' ? m.theftRemark : '',   // P1-7
};
```
and after the boolean day-flags (2283–2285):
```js
d.theftVerified = (d.theftVerified && typeof d.theftVerified === 'object'
  && typeof d.theftVerified.by === 'string' && typeof d.theftVerified.at === 'string')
  ? { by: d.theftVerified.by, at: d.theftVerified.at } : null;   // P1-7
```

Also seed defaults at the two other movements-row construction sites: `initData()` line 966 (`{ inward:null, outward:null, sales:null, grn:null, theft:null, theftRemark:'' }`) + day blob line 962 gains `theftVerified:null`; `addBrand()` line 2174 same row shape. `loadData()` (943) needs NO migration — every read is null-safe — so reads never trigger writes.

## UI (where + exact copy)

1. **Theft remark sheet** (new modal, submit-time): icon 🚨 · title `Theft / Loss — Remark Required` · body `Theft reduces closing stock. Enter a reason for each brand before submitting Day Movements.` · per-row placeholder `Reason / incident detail (required)` · error `Enter a remark for: <brands>` · buttons `Submit with Remarks` / `Back`.
2. **Pre-lock sheet** (`#clk-theft` inside existing End-of-Day modal): header `Theft recorded today — SM verification required:` · rows `BRAND — n unit(s)` + remark line or `No remark (recorded before this update)` · checkbox `I have verified these theft entries (SM)` · error `Tick the theft verification box to proceed.` · verified state `✓ Theft verified by <name> · <HH:MM>`.
3. **Summary scard** (1554): sub `✓ SM verified` / `⚠ Awaiting SM verify` when theft>0, else existing `Shrinkage`.
4. **Movements info bar** (submitted state, 2039): appends ` Theft recorded — SM verifies at closing lock.`
5. **Toasts**: existing submit/lock toasts unchanged; new `Theft changed — SM verification reset. Verify again at closing lock.` (warn).
6. **Exceptions Hub** (bridge): `Stock: WLMHW theft 3 unit(s) on 2026-07-06 not SM-verified — verify & lock closing` — red ⛔, Fix → stock.
All user strings through `esc()`; no rupee values involved.

## Edge cases

1. **theft==0 / all-blank day** — `theftRows()` returns `[]`; submit, pre-lock sheet, `clkValidate`, `doLockClosing` all take today's exact branches. No modal, no checkbox, no copy change.
2. **Legacy day: theft>0, no remark, already submitted** — submit gate never re-runs (already submitted); lock sheet shows rows with “No remark (recorded before this update)” + verify checkbox; one tick locks the day. Nothing bricks.
3. **Legacy day already LOCKED with theft>0, unverified** — untouched by module code; bridge exempts via `closingLocked===true`.
4. **Theft edited after verify** (SM re-open → edit → theft change) — `updMov` nulls `theftVerified` (only when `prev !== newVal`), re-lock re-verifies. Re-open WITHOUT touching theft keeps the stamp (numbers unchanged ⇒ verification still true).
5. **Blank vs 0 theft** — `parseStockInt` gives `null` for blank; both `null` and `0` fail `units > 0`, so neither gates.
6. **CRO tries to lock** — existing guards (1858, 1948) unchanged; the verify checkbox only exists inside the SM-gated sheet, so the stamp is genuinely SM.
7. **Past-day view** — `roBlock()` early-returns in `submitMovements`, `doSubmitTheftRemarks`, `doLockClosing` (existing pattern); the theft sheet can only open from a live-day submit.
8. **Brand removed/renamed while a sheet is open** — `doSubmitTheftRemarks` reloads fresh data and writes only rows that still exist (`if (data.movements[brand])`), mirroring `doLockClosing`'s fresh-reload idiom (1949).
9. **Import with malformed `theftVerified`** (e.g. `true`, `{}`) — normalised to `null`; malformed `theftRemark` → `''`.
10. **Remark XSS** — remarks render only through `esc()` (sheet input `value`, pre-lock display).
11. **Mid-day nag** — today's bridge flag requires `movementsSubmitted===true`, so an SM never sees a red flag while the CRO is still typing the register; a past unlocked theft day flags unconditionally.
12. **Both key spellings** — bridge uses the existing `skey()` map (WLMHW→titanworld, HEMW→helios), reading the SAME blob stock writes; no dedupe needed since stock persists only internal keys.
13. **Multiple thefts across stores** — blobs are per store+date; stamps and exceptions are naturally per store.
14. **P1-5 compose** — theft PRE-CHECK sits before any mutation in `doLockClosing`; P1-5's lock stamp lands after it, both persisted by the one existing `saveData(data)` (1976).

## Verify (browser harness — module state is block-scoped, drive via `moduleFrame.contentWindow.eval`)

Seed: `localStorage.clear()`-safe harness day = today, store titanworld. All snippets run inside `eval` in the stock frame.

1. **Zero-friction path**: set sales only (`updMov` via eval or direct blob write + `renderMovements()`), call `submitMovements()` → assert `loadData().movementsSubmitted===true` AND `document.getElementById('stock-theft-confirm').style.display==='none'`.
2. **Submit gate**: fresh day, `updMov('<bid>','theft','2',null)`; `submitMovements()` → assert `movementsSubmitted===false` and theft modal `display==='flex'`; set the `.thf-remark` input value `'display piece missing'`, call `doSubmitTheftRemarks()` → assert `movements[brand].theftRemark==='display piece missing'` and `movementsSubmitted===true`.
3. **Lock gate**: continue from 2; `st.mode='sm'` (harness-only shortcut past the PIN modal), `toggleLock('closing')` → assert `#clk-theft-cb` exists and `#clk-confirm-btn.disabled===true`; tick the box, `clkValidate()`, `doLockClosing()` → assert `closingLocked===true`, `theftVerified.by` truthy, `theftVerified.at` ISO.
4. **Legacy graceful path**: handcraft blob `{...initData-shape, movementsSubmitted:true, movements:{BRAND:{theft:1,...}}}` WITHOUT `theftRemark`/`theftVerified`, save under today's key; `st.mode='sm'; toggleLock('closing')` → sheet shows `No remark (recorded before this update)`; tick + `doLockClosing()` → locked. No exception thrown.
5. **Invalidation**: craft verified unlocked day; `updMov(bid,'theft','5',null)` → assert `loadData().theftVerified===null` (and unchanged when editing `sales`).
6. **CARRY**: `normaliseImportData({store:'titanworld',date:'2026-07-01',data:<blob with theftRemark:'x', theftVerified:{by:'SM',at:'2026-07-01T10:00:00Z'}>})` → both survive; same call on a blob WITHOUT them → `theftRemark===''`, `theftVerified===null`, no throw.
7. **Bridge** (shell window, not the frame): seed unlocked submitted day with theft>0 unverified → `SaagarBridge.runNow()` → assert `SaagarBridge.exceptions().items.some(x=>x.area==='Stock'&&x.sev==='high'&&/not SM-verified/.test(x.msg))`; then stamp `theftVerified` (or set `closingLocked:true`) → `runNow()` → flag gone. Also assert `closingLocked:true`+unverified (legacy) produces NO flag, and today-unsubmitted produces NO flag.
8. **Regression sweep**: theft==0 full day cycle (opening lock → submit → closing lock via variance sheet) behaves exactly as pre-change; `SM-only` toasts still fire for CRO lock attempts.

## Risk & blast radius

- **MED, contained to stock.html + one read-only bridge block.** The only shared-path edits are 3 gate insertions (`submitMovements`, `clkValidate`, `doLockClosing`) — each is an early-return/compose guard ahead of existing logic; the theft==0 predicate (`theftRows().length===0`) short-circuits all of them.
- Worst credible failure: a bug in `theftRows` (e.g. brands list mismatch) could block submit/lock for theft-free days — mitigated because the gate only ever *adds* a condition when `units>0` (strictly `parseStockInt`-derived numbers) and harness check #1/#8 pin the zero path.
- The bridge block is wrapped in its own `try{}catch(e){}` like every sibling; a throw degrades to “no theft exception”, never a broken hub.
- No writes to other modules' blobs, no new keys, no library, fully offline. `normaliseImportData` edits are additive literals in the designated single Wave-9 pass — the known carry-trap is the ONLY place a silent field-drop could occur and it is explicitly covered (harness check #6).