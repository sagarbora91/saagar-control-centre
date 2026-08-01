# P1-21

SUMMARY: Stamp store code (WLMHW/HEMW, resolved from saagar_employee_master_v1 via the bridge's dsrStoreCode text pattern) plus optional empId onto every NEW grooming record inside the saveCRO() record literal (grooming.html L765-770, the same literal P1-22 extends with checkedBy), and add an in-memory store filter select (All | Titan World | Helios | Unassigned) to the Daily Summary and Month-End Report filter bars, filtering AFTER the _i index-map so per-record delete indexes stay correct; legacy store-less records appear under All and Unassigned only. No normaliser exists (verified: getDay is a raw JSON.parse; round-trip is push/splice only), so no carry work — but the monthly croMap copy at L946 must explicitly copy the new store field.

NEW FIELDS: [
 {
  "field": "store",
  "where": "record objects in saagar_grooming_YYYY-MM-DD arrays (record literal in saveCRO(), grooming.html L765-770)",
  "type": "string — 'WLMHW' | 'HEMW' | '' (unresolved)",
  "default": "absent on legacy records; '' when master lookup fails",
  "carried_in": "no normaliser exists in grooming.html (getDay L544 = raw JSON.parse; saveRecord L537 pushes without reshaping; deleteRecord splices). renderDaily's {...r,_i:i} spread preserves it; renderMonthly's croMap record copy (L946) copies named fields only and MUST add store explicitly."
 },
 {
  "field": "empId",
  "where": "same record literal in saveCRO()",
  "type": "string|number (employee master row .id), OPTIONAL",
  "default": "omitted entirely when the matched master row has no id (assign conditionally, never write undefined/null)",
  "carried_in": "same as store — spread-preserved in renderDaily; not needed in croMap."
 }
]

NEW KEYS: []

CROSS-FILE CONTRACT: none — grooming.html only; reads existing saagar_employee_master_v1 rows ({name, store:'Titan World'|'Helios', gender, active, id?}) read-only; no bridge/exception/EOD surface touched.

SHARED REGIONS: [
 "saveCRO() record object literal, grooming.html L765-770 — P1-22 adds checkedBy to the SAME literal; compose as one literal: name, gender, pct, checked, total, items, date, time, attempt, store, empId?, checkedBy (P1-22)",
 "saveCRO() function body generally (P1-22 may add checker capture just above the literal)",
 "renderDaily() and renderMonthly() if P1-22 surfaces checkedBy in the same cards/table — coordinate chip/column placement"
]

# P1-21 — Grooming: store-wise view (WLMHW vs HEMW)

## Target
File: `V:/Co work/Projects/Retail/_extracted_modules/grooming.html` ONLY (1129 lines).
- **Save site:** `saveCRO()` — record literal at **L765-770** (fields `name, gender, pct, checked, total, items, date, time, attempt`). *(Shared with P1-22, which appends `checkedBy` to this same literal.)*
- **Storage helpers:** `saveRecord()` L537, `getDay()` L544, `getAllKeys()` L558. Key prefix `const STORE='saagar_grooming_'` L531; per-day arrays under `saagar_grooming_YYYY-MM-DD`.
- **Master read pattern already in file:** `grmEmployees()` L630 (reads `saagar_employee_master_v1`, but FILTERS by active+leave — do NOT reuse for store lookup; write a raw-read helper).
- **Views:** Daily filter-bar markup L451-457 + `renderDaily()` L811-886; Monthly filter-bar L477-483 + `renderMonthly()` L934-1030; CSV `exportCSV()` L1035-1050.
- **Reference mapping (cite, don't import):** bridge `dsrStoreCode()` www/integration-bridge.js L201-213 — master `.store` text: `indexOf('helios')>=0 → 'HEMW'`, `indexOf('titan')>=0 → 'WLMHW'`; dsr.html `staffStore()` L1400-1408 confirms master field is `store` = `'Titan World'|'Helios'`.

## Additive-safe: TRUE
Only OPTIONAL new fields (`store`, `empId`) on NEW records; no key rename/reshape; legacy records untouched and still render (they fall in the All/Unassigned buckets). Filter state is in-memory only — **no new localStorage keys**. No bridge/EOD/exception items produced, so the Wave-9 buildExceptions rules do not apply.

## CARRY analysis (normaliser claim — VERIFIED)
grooming.html has **no on-read normaliser**. Round-trip paths, exhaustively:
- `getDay()` L544: `JSON.parse(localStorage.getItem(...)||'[]')` — raw, no reshaping. New fields survive.
- `saveRecord()` L537-542: parses existing array, `push(record)`, re-stringifies — existing records pass through byte-identical (object identity preserved), so a new-format record never strips fields from old ones and vice versa.
- `deleteRecord()` L548 (splice) and `clearDayData()` L554 — no reshaping.
- `renderDaily()` L836: `[...records].map((r,i)=>({...r,_i:i}))` — spread preserves `store`/`empId`.
- **The one carry trap:** `renderMonthly()` croMap copy **L946**: `croMap[key].records.push({date, pct, checked, total})` — named-field copy drops `store`. Must add `store: r.store` there (Step 4).
Conclusion: no normaliser edit needed; only the L946 explicit copy.

## Approach

### Step 1 — store resolver helper (insert after `grmFailPct()`, ~L637)
```js
// P1-21: resolve an employee's store CODE from the master. Raw master read
// (deliberately NOT grmEmployees(): that filters active/leave; store lookup
// must work even for someone on leave or just-retired). Same text pattern as
// the bridge's dsrStoreCode(): 'helios'→HEMW, 'titan'→WLMHW. Unknown → ''.
function grmStoreCode(name){
  var who=String(name||'').trim().toLowerCase(); if(!who) return '';
  try{ var em=JSON.parse(localStorage.getItem('saagar_employee_master_v1')||'[]');
    if(Array.isArray(em)) for(var i=0;i<em.length;i++){ var e=em[i];
      if(e&&String(e.name||'').trim().toLowerCase()===who){
        var st=String(e.store||'').toLowerCase();
        if(st.indexOf('helios')>=0) return 'HEMW';
        if(st.indexOf('titan')>=0)  return 'WLMHW';
        return ''; } }
  }catch(e){}
  return '';
}
// P1-21: master row for empId stamping (first name match; null if none).
function grmEmpRow(name){
  var who=String(name||'').trim().toLowerCase(); if(!who) return null;
  try{ var em=JSON.parse(localStorage.getItem('saagar_employee_master_v1')||'[]');
    if(Array.isArray(em)) for(var i=0;i<em.length;i++){ var e=em[i];
      if(e&&String(e.name||'').trim().toLowerCase()===who) return e; }
  }catch(e){}
  return null;
}
```
Note the unlike-dsrStoreCode difference: **no `active!==false` filter and NO WLMHW fallback** — grooming must not mislabel unknown staff as Titan World; unresolved → `''` (Unassigned). State this in a comment.

### Step 2 — stamp at save (the P1-22 shared literal, L765-770)
Replace the literal with ONE composed literal (P1-22 owner appends `checkedBy` here too — implementation owner merges both into a single edit):
```js
  var __emp = grmEmpRow(name);                    // P1-21 (one lookup, reused)
  const record = {
    name, gender: g, pct, checked, total, items,
    date: todayKey(),
    time: now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),
    attempt: __attempt,
    store: grmStoreCode(name)                     // P1-21: 'WLMHW'|'HEMW'|''
    // P1-22 adds: , checkedBy: ...
  };
  if (__emp && __emp.id != null) record.empId = __emp.id;   // P1-21: optional, never null
```
(If the master rows carry a different id field name — verify at implementation time with a quick console read of `saagar_employee_master_v1[0]` — use that name; if none exists, drop empId silently, the field is optional by design.)

### Step 3 — filter UI + shared state
In-memory state near `let curGender` (~L605): `let grmStoreFilter = 'ALL';   // 'ALL'|'WLMHW'|'HEMW'|'UNASSIGNED'`.
Markup — add ONE `.fg` block to BOTH filter bars (Daily, inside L451-457 before the Clear button; Monthly, inside L477-483 before Export CSV):
```html
<div class="fg">
  <label class="flabel">Store</label>
  <select class="finput" id="grm-store-daily" style="width:190px" onchange="grmSetStore(this.value)">
    <option value="ALL">All stores</option>
    <option value="WLMHW">Titan World</option>
    <option value="HEMW">Helios</option>
    <option value="UNASSIGNED">Unassigned</option>
  </select>
</div>
```
(Monthly copy uses `id="grm-store-monthly"`.) Handler keeps both selects in sync:
```js
function grmSetStore(v){ grmStoreFilter=v;
  var a=document.getElementById('grm-store-daily'), b=document.getElementById('grm-store-monthly');
  if(a) a.value=v; if(b) b.value=v;
  renderDaily(); renderMonthly(); }
function grmRecMatches(r){
  var s=(r&&(r.store==='WLMHW'||r.store==='HEMW'))?r.store:'';
  if(grmStoreFilter==='ALL') return true;
  if(grmStoreFilter==='UNASSIGNED') return s==='';
  return s===grmStoreFilter; }
```
Legacy records (no `store`) ⇒ `s===''` ⇒ visible under **All** and **Unassigned** only — exactly the honest bucket the register asks for.

### Step 4 — apply filter in renderDaily() (L811-886)
Filter **AFTER** the `_i` index map so `delDay(dateStr, origIdx)` (L880) still splices the correct UNFILTERED index:
```js
  const dayAll = getDay(dateStr);
  const records = dayAll.filter(grmRecMatches);           // stats + cards use filtered set
  ...
  const sorted = [...dayAll].map((r,i)=>({...r,_i:i})).filter(grmRecMatches).sort((a,b)=>a.pct-b.pct);
```
i.e. L813 becomes the two lines above (stats L814-829 computed from `records` = filtered), and L836's sorted chain gains `.filter(grmRecMatches)` between map and sort. The empty-state check (L831) uses filtered `total===0`; when a filter hides everything but the day has data, set `#daily-empty .empty-t` text to `No records for this store` (small conditional; optional but recommended copy: title "No records for this filter", sub "Change the Store filter or pick another date").
**Pending strip:** in `grmPendingForDate()` (L640) filter the roster when a store is selected: append `.filter(function(e){ return grmStoreFilter==='ALL' || grmStoreCode(e.name)===(grmStoreFilter==='UNASSIGNED'?'':grmStoreFilter); })` to the returned list.
**Store chip on each card:** in the card template (L866-883) after the gender/time sub-line, add to `.cro-info-sub`: `${rec.store==='HEMW'?' · Helios':rec.store==='WLMHW'?' · Titan World':''}` (nothing shown for legacy — no false claims).

### Step 5 — apply filter in renderMonthly() (L934-1030) + CSV
- L942-947: inside `recs.forEach(r => {...})` add first line `if(!grmRecMatches(r)) return;` and **fix the carry trap**: `croMap[key].records.push({date: dateStr, pct: r.pct, checked: r.checked, total: r.total, store: r.store});`
- Add a `Store` column: `<th>Store</th>` after `Gender` (L503), and in the row template (L1018) after the gender `<td>`: `<td style="font-size:12px;color:var(--gray-600)">${c.store==='HEMW'?'Helios':c.store==='WLMHW'?'Titan World':'—'}</td>` where croMap seeds `store: r.store` on first sight of a CRO (L945: `croMap[key]={name:r.name, gender:r.gender, store:(r.store==='WLMHW'||r.store==='HEMW')?r.store:'', records:[]}`; if a later record has a resolvable store and the seed was '', upgrade it: `else if(!croMap[key].store && (r.store==='WLMHW'||r.store==='HEMW')) croMap[key].store=r.store;`). Note the sticky-column CSS (L193-196) pins cols 1-2 only — a new col-4 is unaffected.
- Mobile `.mt{min-width:640px}` (L289) → bump to `700px` to keep 9 columns readable (pure CSS, scrolls inside `.month-table-wrap`).
- `exportCSV()` (L1035): filter rows with `grmRecMatches` and append a trailing `Store` column: header `...,'Time','Store'`, row `..., r.time, (r.store||'')`.

### Step 6 — filter select init/reset
In `applyViewedDate()` (L1103) nothing needed (filter is orthogonal to date). No persistence: module reload resets to All — acceptable and spec'd.

## UI (exact copy)
- Filter label: `Store`; options: `All stores` / `Titan World` / `Helios` / `Unassigned`.
- Daily card sub-line suffix: ` · Titan World` / ` · Helios` (blank for legacy).
- Monthly new column header: `Store`; cell: `Titan World` / `Helios` / `—`.
- Filtered-empty daily state: title `No records for this filter`, sub `Change the Store filter or pick another date`.

## Edge cases
1. **Legacy records (no `store`)** — visible under All + Unassigned; never counted in WLMHW/HEMW stats; card shows no store suffix; monthly Store cell `—`.
2. **Free-typed name not in master** — `grmStoreCode` returns `''` → saved as Unassigned. NO WLMHW fallback (deliberate divergence from bridge dsrStoreCode; mislabeling would corrupt the ranking this feature exists to fix).
3. **Staff on leave / retired** — store lookup uses the RAW master (no active/leave filter), so a re-check of someone who went on half-day leave mid-day still stamps correctly.
4. **Master row edited later (store transfer)** — records keep the store stamped at save time (point-in-time truth); monthly `store` seed upgrades only from '' to a code, never overwrites.
5. **Delete under an active filter** — `_i` is mapped before filtering, so `delDay` splices the right record even when the visible list is a subset.
6. **Per-CRO mixed stores in one month** (transfer mid-month) — croMap keys by name; with a store filter active only matching records aggregate, so the same CRO can legitimately show different numbers under each store filter. Under All, records merge (unchanged legacy behaviour).
7. **`store:''` vs absent** — both normalize to Unassigned via `grmRecMatches`; never test `'store' in r`.
8. **Pending strip + store filter** — roster chips restrict to the selected store via live `grmStoreCode`; Unassigned shows only staff whose master store text matches neither pattern.
9. **Two records/day cap, re-check flow, leave gate** — all key off `name` only; untouched.
10. **empId absent from master** — field omitted entirely (conditional assign); JSON stays clean, no `null`s.
11. **P1-22 composition** — both items edit ONE record literal; the implementation owner lands `store`/`empId` and `checkedBy` in a single edit (see Shared regions).

## Verify (browser harness, `moduleFrame.contentWindow.eval`)
Tab-switcher function: **`go('cl'|'daily'|'monthly')`**.
1. Seed master: `localStorage.setItem('saagar_employee_master_v1', JSON.stringify([{name:'Asha K', gender:'F', store:'Helios', active:true, id:'E7'},{name:'Ravi P', gender:'M', store:'Titan World', active:true}]))`, reload module.
2. `eval`: `grmStoreCode('Asha K')==='HEMW' && grmStoreCode('Ravi P')==='WLMHW' && grmStoreCode('Nobody')===''`.
3. Save a record for Asha via UI (fill `#cro-inp`, `sg('f')`, `startCL()`, `saveCRO()`); then `eval`: `JSON.parse(localStorage.getItem('saagar_grooming_'+todayKey())).slice(-1)[0]` → has `store:'HEMW'` and `empId:'E7'`; Ravi's record → `store:'WLMHW'`, no `empId` key if master row lacks id.
4. Inject a LEGACY record (no store) into today's array via eval; `go('daily')`: All shows 3 cards; `grmSetStore('HEMW')` → 1 card, stats `ds-total`=1; `grmSetStore('UNASSIGNED')` → legacy card only; delete it under the filter and confirm the CORRECT record vanished from the raw array (index-safety check).
5. `go('monthly')`: Store column renders `Helios`/`Titan World`/`—`; `grmSetStore('WLMHW')` → only Ravi row; `ms-total` matches. `exportCSV` blob contains trailing Store column and only filtered rows.
6. Regression: past-date view (`window.__stAsOf` yesterday + dispatch `st-date`) still read-only; 2/day cap toast still fires; 0 console errors.

## Risk & blast radius
Low. Single decoded blob; no bridge/shell/EOD surface; no new keys; read-only master consumption. Riskiest edit is renderDaily's filter-vs-`_i` ordering (delete index corruption if filtered before mapping — spec'd explicitly, verify step 4 covers it) and the renderMonthly L946 named-copy carry trap (spec'd). P1-22 collision confined to the one record literal — merge as one edit.