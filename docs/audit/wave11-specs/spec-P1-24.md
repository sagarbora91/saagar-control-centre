# P1-24

SUMMARY: Per-store CRO targets via an optional byStore map on cro_s_v3 ({WLMHW,HEMW} keyed by code, per-field fallback to global), a Dashboard store selector (All | Titan World | Helios) filtering audits by the existing a.store label via a croStoreCode() text-match, per-store effective targets everywhere targets are shown (dashboard KPIs, week breakdown, per-CRO cards, entry-form progress/scoring via getTargets()). CRITICAL CARRY confirmed and handled: saveSettings() rebuilds the settings object field-by-field and must spread the previously-stored object; getS() (Object.assign over DEF) already carries unknown props on read.

NEW FIELDS: [
 {
  "field": "byStore",
  "where": "cro_s_v3 settings object (localStorage, existing key)",
  "type": "object map: {WLMHW?:{surveys?:number,reviews?:number,mktg?:number}, HEMW?:{...}} — sparse; only non-blank overrides stored",
  "default": "absent (undefined) → every reader falls back to the global surveys/reviews/mktg numbers, so zero-config behavior is byte-identical to today",
  "carried_in": "getS() L780 carries it automatically (Object.assign({},DEF,stored) — DEF has no byStore so the stored value wins). saveSettings() L785-792 is the drop site: it MUST start from const prev=getS() and spread {...prev,...} before overwriting the five scalar fields, then rebuild byStore from the per-store form inputs (delete s.byStore when all inputs blank). No other writer of cro_s_v3 exists."
 }
]

NEW KEYS: []

CROSS-FILE CONTRACT: none — cro_audit.html only; no bridge/buildExceptions items, no new localStorage keys, no shell edits. (Store codes WLMHW/HEMW are internal constants mapped to the audit form's existing store labels 'Titan World, Latur' / 'Helios, Latur'; nothing else reads them.)

SHARED REGIONS: [
 "getS()/saveSettings()/loadSettingsForm() settings block L778-821 (any sibling item touching cro_s_v3 must preserve the spread-prev carry)",
 "sec-settings card markup L651-696 (new Per-Store Targets card appended)",
 "renderWeekDash L1604-1688 / renderMonthDash L1690-1782 / buildWeekBreakdown L1784-1824 / groupByCRO L1826-1841 (P1-23/P1-25 dashboards or exports touching the same render functions)",
 "loadPreData L842-877 and input handlers onNpsInput/onRevInput/onMktgInput L1211-1260",
 "sec-dash markup L609-626 (store selector inserted above period-toggle)"
]

# P1-24 — CRO Audit: per-store targets + store dimension

## Target
File: `V:\Co work\Projects\Retail\_extracted_modules\cro_audit.html` ONLY (line numbers from current file, 2254 lines).
- Settings: `DEF` L778, `getS()` L780, `saveSettings()` L782-795, `loadSettingsForm()` L797-805, `updDerived()` L810-821, settings markup L651-696 (`sec-settings`).
- Data: `getAudits()` L1460 (`cro_audits_v3`); every record already carries `store` (full label from the `#f-store` select L555-559: `Titan World, Latur` / `Helios, Latur`) — **no employee-master lookup needed**; attribution is direct off `a.store`, with a dsrStoreCode-style text-match helper for resilience against label drift.
- Dashboard: markup L609-626 (`sec-dash`), `renderDash()` L1602, `renderWeekDash()` L1604-1688, `renderMonthDash()` L1690-1782, `buildWeekBreakdown()` L1784-1824, `groupByCRO()` L1826-1841, state vars `dashMode/dashOff` L829-830.
- Entry-form progress: `loadPreData()` L842-877 (`weekPre`/`monthPre`), `onNpsInput()` L1211-1232, `onRevInput()` L1234-1248, `onMktgInput()` L1250-1260, `onCroDateChange()` (~L1950s, wired from `#f-store onchange` L555).
- Tab switcher: `go(tab)` L1916-1925.

## Additive-safe
**TRUE.** One new OPTIONAL field `byStore` inside the existing `cro_s_v3` object; absent → all readers fall back per-field to the global numbers, so zero-config = today exactly. No key renames/reshapes; audit records untouched. **The one landmine is the SAVE path**: `saveSettings()` L785-791 builds a brand-new 5-field object literal — without carrying, `byStore` is silently dropped the next time anyone taps “Save Targets”. Read path is already safe: `getS()` = `Object.assign({},DEF,JSON.parse(...))`, and `DEF` has no `byStore`, so the stored map survives reads unmodified.

## Approach

**Step 1 — Constants + helpers** (place after `DEF` L778):
```js
const CRO_STORES=[
  {code:'WLMHW', label:'Titan World, Latur', short:'Titan World'},
  {code:'HEMW',  label:'Helios, Latur',      short:'Helios'}
];
/* dsrStoreCode-style tolerant text match on the record's store label */
function croStoreCode(label){
  const t=String(label||'').toLowerCase();
  if(t.includes('titan'))  return 'WLMHW';
  if(t.includes('helios')) return 'HEMW';
  return null;
}
/* Effective targets for one store; null/unknown code → globals. npsScore/rate stay GLOBAL (quality thresholds, not volume). */
function getTargets(storeCode){
  const s=getS();
  const bs=(s.byStore&&typeof s.byStore==='object')?s.byStore:{};
  const o=(storeCode&&bs[storeCode]&&typeof bs[storeCode]==='object')?bs[storeCode]:{};
  return { surveys:+o.surveys||s.surveys, reviews:+o.reviews||s.reviews, mktg:+o.mktg||s.mktg,
           npsScore:s.npsScore, rate:s.rate };
}
/* Dashboard targets for the current store filter */
function getDashTargets(){
  const s=getS();
  if(dashStore) return getTargets(dashStore);
  if(!s.byStore) return getTargets(null);           // zero-config All = global (today)
  const t={surveys:0,reviews:0,mktg:0,npsScore:s.npsScore,rate:s.rate};
  CRO_STORES.forEach(st=>{const e=getTargets(st.code); t.surveys+=e.surveys; t.reviews+=e.reviews; t.mktg+=e.mktg;});
  return t;                                          // configured All = sum of per-store effective targets
}
```

**Step 2 — CARRY fix in `saveSettings()` (L782-795)** — the critical edit:
```js
function saveSettings(){
  if(stIsPast()){ showToast('Viewing a past day — settings are read-only'); return; }
  const prev=getS();                                  // CARRY: never rebuild from scratch
  const s={ ...prev,
    surveys: +document.getElementById('s-surveys').value||DEF.surveys,
    npsScore:+document.getElementById('s-nps-score').value||DEF.npsScore,
    rate:    +document.getElementById('s-rate').value||DEF.rate,
    reviews: +document.getElementById('s-reviews').value||DEF.reviews,
    mktg:    +document.getElementById('s-mktg').value||DEF.mktg };
  const byStore={};
  CRO_STORES.forEach(st=>{
    const o={};
    ['surveys','reviews','mktg'].forEach(k=>{
      const el=document.getElementById(`s-${st.code}-${k}`);
      const v=el?+el.value:0; if(v>0) o[k]=v;         // blank/0 = inherit global
    });
    if(Object.keys(o).length) byStore[st.code]=o;
  });
  if(Object.keys(byStore).length) s.byStore=byStore; else delete s.byStore;
  localStorage.setItem('cro_s_v3', JSON.stringify(s));
  showToast('Targets saved!');
  buildTasks();
}
```
Note: the settings form saves **whole-object** (single `setItem`), from form fields only — that is exactly why the spread of `prev` is mandatory; without it any future sibling field would drop too.

**Step 3 — Settings UI** — new card in `sec-settings` after the “Monthly KPI Targets” card (insert before the “Scoring Reference” card, ~L691); `loadSettingsForm()` (L797-805) additionally fills the six new inputs from `getS().byStore` (blank when absent):
```html
<div class="card">
  <div class="card-title">Per-Store Targets (optional)</div>
  <div class="card-sub">Leave blank to use the global monthly targets above for that store</div>
  <!-- one .frow trio per store: -->
  <div class="set-hint">Titan World, Latur</div>
  <div class="frow">
    <div class="fg"><label class="flabel">NPS Surveys / Month</label>
      <input class="finput" type="number" id="s-WLMHW-surveys" min="1" placeholder="Global (80)"></div>
    <div class="fg"><label class="flabel">Google Reviews / Month</label>
      <input class="finput" type="number" id="s-WLMHW-reviews" min="1" placeholder="Global (30)"></div>
    <div class="fg"><label class="flabel">Marketing Activities / Month</label>
      <input class="finput" type="number" id="s-WLMHW-mktg" min="1" placeholder="Global (120)"></div>
  </div>
  <div class="set-hint">Helios, Latur</div>
  <!-- same trio with id="s-HEMW-*" -->
</div>
```
(Placeholders should render the LIVE globals: set them in `loadSettingsForm()` via `ph.placeholder='Global ('+s.surveys+')'` etc., not hardcoded.)

**Step 4 — Dashboard store selector.** New state next to L829-830: `let dashStore='';` (''=All). Markup inserted in `sec-dash` ABOVE the existing `.period-toggle` (L612):
```html
<div class="period-toggle" id="store-toggle" style="margin-bottom:8px">
  <button class="pt-btn active" id="ps-all"   onclick="setDashStore('')">All Stores</button>
  <button class="pt-btn" id="ps-WLMHW" onclick="setDashStore('WLMHW')">Titan World</button>
  <button class="pt-btn" id="ps-HEMW"  onclick="setDashStore('HEMW')">Helios</button>
</div>
```
```js
function setDashStore(c){ dashStore=c;
  [['ps-all',''],['ps-WLMHW','WLMHW'],['ps-HEMW','HEMW']].forEach(([id,v])=>
    document.getElementById(id).classList.toggle('active',v===c));
  renderDash(); }
```

**Step 5 — Filter + retarget the two dash renders.**
- `renderWeekDash()` L1607-1608 and `renderMonthDash()` L1695-1696: after building `cur`/`prv`, add
  `if(dashStore){ const f=a=>croStoreCode(a.store)===dashStore; cur=cur.filter(f); prv=prv.filter(f); }` (change `const` to `let`).
- Replace target reads: keep `const s=getS()` (still used for `rate`/`npsScore` copy) and add `const T=getDashTargets()`; swap `s.surveys/s.reviews/s.mktg` → `T.surveys/T.reviews/T.mktg` at L1610 (`wT_*`), monthly KPI cards L1723/1738/1743-1745 and per-CRO card denominators L1767/1771, and pass the effective set into `buildWeekBreakdown(cur, mi.year, mi.month, {...s,...T})` (L1719) so its `wT_*` at L1800 and header L1821 follow.
- Empty-state copy (L1617/L1704): append store name when filtered, e.g. `No audits this week — Titan World`.
- Optional 1-liner: append `· ${dashStore?CRO_STORES.find(x=>x.code===dashStore).short:'All stores'}` to `#pn-sub` (L1613/L1700) so the active filter is visible in print/screenshots.

**Step 6 — Entry-form progress + scoring follow the form's store.**
- The three input handlers L1211-1260 each do `const s=getS()`. Change to `const s=getTargets(croStoreCode(document.getElementById('f-store').value));` — `getTargets` returns the same 5 field names (`surveys,reviews,mktg,npsScore,rate`), so `calcNps(tData['t5'],s)` L1224, `calcRev` L1243, `calcMktg` L1255, `wkly()/daily()` calls and the `updWM` progress bars all follow per-store targets with ZERO further edits. With `byStore` absent this is value-identical to today (scoring unchanged). Scoring intentionally honors per-store targets once configured — that is the point of the feature; state this in the changelog copy.
- `loadPreData()` L842-877: pre-counts currently sum BOTH stores. Add, only when per-store mode is configured (preserves today's behavior otherwise):
```js
const st=document.getElementById('f-store')?.value||'';
if(getS().byStore && st){ const c=croStoreCode(st);
  const sf=a=>croStoreCode(a.store)===c;
  wAudits=wAudits.filter(sf); mAudits=mAudits.filter(sf); }   // change const→let above
```
- `#f-store` already fires `onCroDateChange()` on change (L555); add `loadPreData();` as the first line inside `onCroDateChange()` (then re-run the currently-typed counts via the existing calls it makes / or follow with `onNpsInput();onRevInput();onMktgInput();` guarded by element existence) so switching store refreshes the week/month bars.

## Data model & CARRY analysis
- **`byStore`** — object map on `cro_s_v3`, `{WLMHW?:{surveys?,reviews?,mktg?}, HEMW?:{...}}`, all numbers ≥1, **sparse** (only explicit overrides stored). Default: **absent** → `getTargets()` returns globals; dashboards, entry form and scoring behave exactly as today. Carry sites: `getS()` L780 carries it for free (Object.assign, DEF has no byStore key); **`saveSettings()` L785-792 is the only writer of `cro_s_v3` and MUST spread `getS()` first** (Step 2) or byStore drops on the next save — this is the item's MED-risk core. There is no other settings normaliser/defaults literal in the file (verified: only two `cro_s_v3` references, L780 read + L792 write).
- **New localStorage keys: none.** Audit records (`cro_audits_v3`) unchanged — store dimension already exists as `a.store`.
- `dashStore` is in-memory only (resets to All on module load — acceptable).

## UI
1. **Settings** → new card “**Per-Store Targets (optional)**”, sub “Leave blank to use the global monthly targets above for that store”; two labelled groups “Titan World, Latur” / “Helios, Latur”, three inputs each (NPS Surveys / Month, Google Reviews / Month, Marketing Activities / Month), placeholder “Global (n)” with live global value. Saved by the existing single “Save Targets” button.
2. **Dashboard** → segmented control above the Weekly/Monthly toggle: “**All Stores | Titan World | Helios**” (reuses `.period-toggle/.pt-btn` styles, no new CSS). Filter reflected in `#pn-sub` and empty-state (“No audits this week — Helios”).
3. **Audit form** → no new controls; the existing week/month progress bars and auto-score strips simply use the selected store's targets.

## Edge cases
1. `byStore` absent (fresh install / never configured): all paths return globals; All-stores dashboard target = global numbers — byte-identical to today.
2. `byStore` configured, dashboard “All Stores”: volume targets = **sum of the two effective per-store targets** (not the stale global), so All can no longer be trivially “met” by one big store; `rate`/`npsScore` stay global.
3. Corrupted `byStore` (string/array/proto-key junk from a bad restore): `getTargets()` type-guards (`typeof ... ==='object'`) and per-field `+o.x||global` coerces NaN/0/negatives to the global fallback. Never throws.
4. Per-store override of 0 or blank = “inherit global” (`v>0` gate on save; `+o.x||` on read) — you cannot set a target of 0, matching the global inputs' `min="1"`.
5. Legacy/edited records whose `a.store` label drifts (e.g. just “Titan World” or trailing spaces): `croStoreCode()` matches on 'titan'/'helios' substrings; unmatched labels return `null` → excluded from a store-filtered dashboard view but always included in All (document in code comment).
6. Store filter + `prv` trend: previous-period comparison is filtered by the same store, so ▲/▼ deltas compare like-for-like.
7. Past-day view (`stIsPast()` L728): `saveSettings()` already blocks; the new inputs are covered by the same guard — no extra work, but the disable/readonly sweep (if any exists for settings inputs) should include the six new ids.
8. Entry form with no store selected yet: `croStoreCode('')` → null → global targets and (per Step 6 gate) unfiltered pre-counts; nothing breaks pre-selection.
9. Editing an existing audit (cro-dup-guard `editingId` path L1394-1427): unchanged — record shape untouched; re-scored pts follow the CURRENT per-store targets, same as today's behavior with global target edits.
10. `updDerived()` L810-821 (weekly/daily hints under the GLOBAL inputs) stays global-only — do not wire the per-store inputs into it (no `d-*` elements for them; optional stretch, not required).

## Verify (browser harness, `moduleFrame.contentWindow.eval`; tab switcher = **`go(tab)`** L1916)
1. Seed: `localStorage.setItem('cro_s_v3',JSON.stringify({surveys:80,npsScore:85,rate:40,reviews:30,mktg:120,byStore:{WLMHW:{surveys:100},HEMW:{surveys:20,reviews:10}}}))`; seed 2 audits in `cro_audits_v3` this month, one per store (`store:'Titan World, Latur'` t5.npsCollected=50, `store:'Helios, Latur'` t5.npsCollected=15).
2. `eval("getTargets('WLMHW').surveys")`→100; `getTargets('HEMW')`→{surveys:20,reviews:10,mktg:120}; `getTargets(null).surveys`→80; `croStoreCode('Titan World, Latur')`→'WLMHW'.
3. `eval("go('dash');setPeriod('month');getDashTargets().surveys")`→120 (100+20, All); `setDashStore('HEMW')` → dash-content shows only the Helios audit, KPI sub reads “Target: 20/month”, surveys 15/20 amber; `setDashStore('WLMHW')` → 50/100; `setDashStore('')` restores All.
4. CARRY: `eval("go('settings');loadSettingsForm();saveSettings();JSON.parse(localStorage.getItem('cro_s_v3')).byStore.WLMHW.surveys")`→100 (survives a plain re-save with untouched per-store inputs). Then blank all six per-store inputs, save → `byStore` key absent from stored JSON.
5. Zero-config: remove `byStore`, `eval("getDashTargets().surveys")`→80 on All and on each store; re-render dashboards → output identical to pre-change baseline.
6. Entry form: `go('audit')`, set `#f-store` to Helios, `eval("onCroDateChange();weekPre.surveys")` counts only Helios pre-audits (byStore present); type into `#nps-coll` → `#m-nps` bar target reflects 20.
7. Corruption guard: `byStore:'garbage'` → `getTargets('WLMHW')` returns globals, no console error on `renderDash()`; run full-module smoke (all 4 tabs) with 0 console errors.

## Risk & blast radius
- **MED, contained to cro_audit.html.** No bridge, no buildExceptions, no shell mapping, no new keys — EOD/hub untouched.
- Highest-risk edit: `saveSettings()` rewrite (Step 2) — a mistake there could corrupt targets globally; mitigated because the function is 14 lines, whole-object save, single writer, and Verify #4/#5 pin both carry and zero-config parity.
- Behavior deltas ONLY when `byStore` is configured: (a) All-stores dash volume targets become the per-store sum, (b) t5/t6/t7 auto-scores follow the form store's targets, (c) entry-form pre-counts become store-scoped. All three are the feature's intent; none are reachable in zero-config.
- Dashboard renders are string-template rewrites of `#dash-content` — filtered re-render cannot leak state; `dashStore` resets on reload.
- Shared-region caution for the Wave-11 CRO cluster: P1-23/P1-25 owners touching `renderWeekDash`/`renderMonthDash`/`groupByCRO` or the settings block must rebase on this item's `let cur/prv` + `T` variable introductions and the `saveSettings` spread.