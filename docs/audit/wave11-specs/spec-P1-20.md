# P1-20

SUMMARY: Read-only "Top Failed Checks" panel in the grooming Month-End Report tab: aggregate items[{label,passed}] across all saagar_grooming_YYYY-MM-DD records for the picked month, keyed by gender+label (M/F checklists differ), render top 8 failed checks with fail count and fail-rate as a card between the stat grid and the ranking table, computed inside renderMonthly(). Zero persisted changes — no new localStorage keys, no new record fields, no CSV change; grooming.html has no normaliser so nothing to carry.

NEW FIELDS: []

NEW KEYS: []

CROSS-FILE CONTRACT: none

SHARED REGIONS: [
 "renderMonthly() (grooming.html L934-1030) — computation is appended at its end; any sibling grooming item (P1-21/P1-22) that edits the month report renderer touches the same function",
 "#monthly section markup (grooming.html L476-515) — new panel div inserted between the statgrid (ends L490) and #monthly-empty (L492)",
 "go(id) tab switcher (L592-600) — read-only dependency (calls renderMonthly), not edited"
]

# P1-20 — Grooming: Most-Failed Parameters ("Top Failed Checks") panel

## Target
- **File:** `V:/Co work/Projects/Retail/_extracted_modules/grooming.html` ONLY (decoded blob; re-embed via the usual scratchpad embed pipeline — no other file changes).
- **Functions / regions (line numbers = current file):**
  - `renderMonthly()` — L934–1030. All new aggregation + rendering goes at the END of this function (after the existing tbody loop finishes at L1029). Do NOT reorder or edit existing statements.
  - `#monthly` section markup — L476–515. New panel HTML inserted between the closing `</div>` of the `.statgrid` (L490) and `#monthly-empty` (L492).
  - `esc()` helper — L810 (already defined; reuse for labels/text).
  - Storage: `STORE = 'saagar_grooming_'` (L531), `getDay(dateStr)` (L544), `getAllKeys()` (L558). Records are `{name, gender:'m'|'f', pct, checked, total, items:[{label:string, passed:bool}], date, time, attempt}` — written by `saveCRO()` L742–791; `items` built at L753–758 from the DOM checklist `.cltxt` labels.
  - Tab switcher: `go(id)` L592–600 — `go('monthly')` calls `renderMonthly()`. Month picker `#month-picker` (L480) already has `onchange="renderMonthly()"`.
- **Facts established by inspection:**
  - There is **no** `CRIT_M`/`CRIT_F` JS constant. The criteria live as hardcoded DOM checklists: `#cl-m` (L379–407, 15 items) and `#cl-f` (L410–444, 15 items). Labels overlap between genders (e.g. "Shoes are black and polished — no tan or brown", "Belt is black…", "Watch: gold/silver…", "Nails clean, dry, and trimmed", uniform items) but the lists are NOT identical → aggregate keyed by `gender + label` and render split by gender, per the record's own `gender` field (never re-derive from the DOM lists — historical records may predate label edits).
  - There is **no print path** in grooming.html (zero matches for print/SaagarReport/pdf). The only export is `exportCSV()` L1035–1050 — leave it untouched (its row shape is a de-facto contract).
  - grooming.html has **no on-read normaliser** — plainly additive module; and this feature persists nothing anyway.

## Additive-safe
**TRUE.** Purely read-only aggregation over existing records. No new localStorage keys, no new record fields, no writes of any kind, no changes to `saveCRO()`, `exportCSV()`, or any existing render output. Legacy records lacking `items[]` (or with non-array `items`) are skipped defensively. Nothing for a normaliser to carry (and none exists). No bridge/EOD surface: this does not add exceptions, hub items, or close-day steps.

## Approach

### Step 1 — Markup: insert the panel container
In `#monthly`, immediately after the `.statgrid` closing `</div>` (L490) and before `#monthly-empty` (L492), insert:

```html
    <!-- P1-20: Top Failed Checks (read-only aggregation over the month's items[]) -->
    <div class="card" id="grm-topfail" style="display:none;margin-bottom:18px">
      <div class="sec-title">Top Failed Checks</div>
      <div class="sec-sub" id="grm-topfail-sub">Most-missed grooming standards this month</div>
      <div id="grm-topfail-body"></div>
    </div>
```

`.card`, `.sec-title`, `.sec-sub` classes already exist (used by `#form-card` L330–332) so no new CSS is strictly required. Add ONE small style block for the rows (place with the other component styles near `.month-table-wrap` L174):

```css
.tf-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--gray-100);}
.tf-row:first-child{border-top:none;}
.tf-lbl{flex:1;min-width:0;font-size:13px;color:var(--navy);font-weight:500;}
.tf-g{font-size:10px;font-weight:700;letter-spacing:.05em;padding:2px 8px;border-radius:10px;flex-shrink:0;}
.tf-g.m{background:#e0f2fe;color:#0369a1;}
.tf-g.f{background:#fce7f3;color:#be185d;}
.tf-n{font-size:13px;font-weight:700;color:var(--red);flex-shrink:0;white-space:nowrap;}
.tf-rate{font-size:11px;color:var(--gray-400);flex-shrink:0;white-space:nowrap;min-width:86px;text-align:right;}
.tf-bar{width:90px;height:6px;background:var(--gray-100);border-radius:3px;overflow:hidden;flex-shrink:0;}
.tf-bar-fill{height:100%;background:var(--red);border-radius:3px;}
@media (max-width:640px){ .tf-bar{display:none;} .tf-rate{min-width:0;} }
```

(If the mobile media query block at ~L240–290 is the house pattern, put the `@media` rule inside it instead — either is fine; do not restyle anything existing.)

### Step 2 — Aggregation + render inside `renderMonthly()`
Append at the very end of `renderMonthly()` (after L1029 `tbody.appendChild(tr);` loop closes, before the function's closing `}` at L1030):

```js
  // ── P1-20: Top Failed Checks (read-only; keyed by gender+label because the
  //    male/female checklists share some labels but are different lists) ──
  try {
    var failMap = {}; // 'm|<label>' → {label, gender, fails, seen}
    allKeys.forEach(function(dateStr){
      getDay(dateStr).forEach(function(r){
        if (!r || !Array.isArray(r.items)) return;          // legacy/malformed guard
        var g = (r.gender==='f') ? 'f' : 'm';
        r.items.forEach(function(it){
          if (!it || typeof it.label !== 'string') return;
          var k = g + '|' + it.label;
          if (!failMap[k]) failMap[k] = {label: it.label, gender: g, fails: 0, seen: 0};
          failMap[k].seen++;
          if (it.passed !== true) failMap[k].fails++;
        });
      });
    });
    var failed = Object.values(failMap).filter(function(x){ return x.fails > 0; });
    failed.sort(function(a,b){
      return (b.fails - a.fails)
          || ((b.fails/b.seen) - (a.fails/a.seen))
          || a.label.localeCompare(b.label);
    });
    var TOPN = 8;
    var top = failed.slice(0, TOPN);
    var panel = document.getElementById('grm-topfail');
    var body  = document.getElementById('grm-topfail-body');
    var sub   = document.getElementById('grm-topfail-sub');
    if (panel && body) {
      if (empty || top.length === 0) {
        panel.style.display = 'none';
        body.innerHTML = '';
      } else {
        panel.style.display = '';
        if (sub) sub.textContent = 'Most-missed grooming standards this month — top ' + top.length + ' of ' + failed.length + ' checks with failures';
        body.innerHTML = top.map(function(x){
          var rate = Math.round(x.fails / x.seen * 100);
          return '<div class="tf-row">'
            + '<span class="tf-g ' + x.gender + '">' + (x.gender==='m'?'GENTS':'LADIES') + '</span>'
            + '<span class="tf-lbl">' + esc(x.label) + '</span>'
            + '<span class="tf-n">failed ' + x.fails + (x.fails===1?' time':' times') + '</span>'
            + '<span class="tf-bar"><span class="tf-bar-fill" style="width:' + rate + '%"></span></span>'
            + '<span class="tf-rate">' + rate + '% fail rate (' + x.fails + '/' + x.seen + ')</span>'
            + '</div>';
        }).join('');
      }
    }
  } catch(e) { /* never let the report tab break on aggregation */ }
```

Notes for the owner:
- `allKeys`, `empty`, and `getDay` are already in scope at that point in `renderMonthly()` (L936, L971, L544). Reuse them — do NOT re-read the month picker.
- `it.passed !== true` (not `!it.passed`) so a hypothetical missing/undefined `passed` counts as a fail only intentionally — actually it does count as fail; that is correct: `saveCRO()` always writes a boolean, so only truly-passed items are excluded.
- The whole block is wrapped in try/catch so a malformed legacy record can never blank the Month-End tab.
- `esc()` on the label is mandatory — labels currently come from hardcoded DOM but records travel across devices via migration export and must be treated as untrusted (same reasoning as the existing xss-grooming-names audit fix at L808–810).

## Data model & CARRY analysis
- **New persisted fields: NONE.** The feature reads `record.items[].label`/`.passed` and `record.gender`, all of which have existed since the module's original schema (header comment L528–529) and are written by `saveCRO()` L753–770.
- **New localStorage keys: NONE.**
- **Normaliser carry: N/A** — grooming.html has no on-read normaliser (confirmed; records are used raw from `getDay()`), and nothing new is persisted regardless. Zero drop-on-normalize exposure.
- Aggregation key is transient in-memory only (`gender + '|' + label`).

## UI
- **Where:** Month-End Report tab (`#monthly`), a `.card` titled **"Top Failed Checks"** directly below the four stat cards and above the CRO ranking table. Hidden when the month has no records or no failures.
- **Exact copy:**
  - Card title: `Top Failed Checks`
  - Subtitle (dynamic): `Most-missed grooming standards this month — top {N} of {M} checks with failures` (static fallback in markup: `Most-missed grooming standards this month`)
  - Gender chip: `GENTS` / `LADIES`
  - Count: `failed 14 times` (singular: `failed 1 time`)
  - Rate: `47% fail rate (14/30)` — fails/appearances, plus a small red fill bar sized to the rate (bar hidden on mobile ≤640px).
- Example row: `LADIES · Lipstick shade — nude only · failed 14 times · ▓▓▓░ · 47% fail rate (14/30)`.
- No print output exists in this module (CSV-only export); `exportCSV()` is deliberately NOT extended — its column shape is a de-facto contract.

## Edge cases
1. **Empty month** (`cros.length===0` → `empty===true`): panel hidden; existing `#monthly-empty` behaviour unchanged.
2. **Month with records but zero failures** (everyone 100%): `failed` is empty → panel hidden (no gloating empty state needed).
3. **Legacy/malformed record without `items` array** (or `items` not an array, e.g. migrated/QMS-era data): skipped by the `Array.isArray` guard; the record still counts in the existing pct stats exactly as today.
4. **Item entry missing/odd `label`**: skipped by the `typeof it.label !== 'string'` guard.
5. **Shared labels across genders** (Shoes, Belt, Watch, Nails, Uniform items): counted separately per gender by design — the M and F checklists are distinct lists; a combined count would misstate the fail-rate denominator.
6. **Re-check records (`attempt:2`, Wave-4)**: counted as separate check-ins, matching how the existing Month Average and Check-ins stats already treat them — consistent basis, documented here so the owner doesn't "fix" it.
7. **Fewer than 8 failed checks**: show all; subtitle reads `top {N} of {N}…`.
8. **Ties in fail count**: broken by higher fail-rate, then label A→Z — deterministic render across reloads.
9. **`gender` neither 'm' nor 'f'** (defensive; `saveCRO` can only save m/f but data travels): bucketed to 'm' by the `(r.gender==='f')?'f':'m'` fold — never crashes, never drops the record.
10. **Historical label text drift** (if checklist copy is ever edited later): old and new labels aggregate as separate rows — acceptable and honest for a per-month report.
11. **Past-date VIEW-ONLY mode** (`isPastView()`): Month report is already view-safe; this panel is read-only so no `applyReadOnly()` interaction — verify it renders identically under a past `__stAsOf`.

## Verify (browser harness)
Module tab-switcher function is **`go(id)`** — use `go('monthly')` to enter the report tab. All via `moduleFrame.contentWindow.eval(...)` after loading the grooming module:
1. **Seed:** write two dated keys in the picked month, e.g.
   `localStorage.setItem('saagar_grooming_2026-07-03', JSON.stringify([{name:'Test A',gender:'m',pct:80,checked:12,total:15,items:[{label:'Shoes are black and polished — no tan or brown',passed:false},{label:'Nails clean, dry, and trimmed',passed:true}],date:'2026-07-03',time:'10:00 am',attempt:1}]))` and a second day with the same failing label plus a female record failing `'Lipstick shade — nude only'`.
2. `go('monthly'); document.getElementById('month-picker').value='2026-07'; renderMonthly();` → assert `document.getElementById('grm-topfail').style.display !== 'none'` and `grm-topfail-body` contains `failed 2 times` for the Shoes label with chip `GENTS`, and `failed 1 time` + `LADIES` for Lipstick.
3. **Fail-rate check:** with Shoes appearing in 2 male records and failing both → row text contains `100% fail rate (2/2)`.
4. **Gender split check:** add a female record failing the same Shoes label → TWO separate Shoes rows (GENTS and LADIES), counts not merged.
5. **Legacy guard:** append a record with `items: null` and one with no `items` key → `renderMonthly()` throws nothing (wrap the eval in try/catch and assert no error), existing stat cards still populate, panel counts unchanged.
6. **Empty/off month:** set picker to `2026-01`, `renderMonthly()` → panel `display==='none'`, `#monthly-empty` visible, zero console errors.
7. **No-failure month:** month whose only records have all `passed:true` → panel hidden.
8. **Regression:** existing assertions still hold — `ms-cros`/`ms-total`/`ms-best`/`ms-avg` values and `#monthly-tbody` row count identical before/after the patch for the same seed; `exportCSV` output byte-identical.
9. **XSS:** seed an item label `<img src=x onerror=window.__pwn=1>` → after render, `!contentWindow.__pwn` and label visible as text (esc applied).
10. Whole-shell harness: 0 console errors across all tabs (`go('cl')`, `go('daily')`, `go('monthly')`).

## Risk & blast radius
- **Blast radius: one function tail + one markup insert + one CSS block in one blob.** No storage writes, no bridge/EOD/exceptions surface (no `buildExceptions` item, no EXC_AREA, no close-day step interaction), no shell edit, no other module reads grooming per-day keys for items (bridge reads only name/pct-level gate data — `saagar_gate_status` / `saagar_bridge_config`, both untouched).
- **Main risk:** breaking `renderMonthly()` for existing users — mitigated by appending after all existing statements, reusing in-scope locals, and try/catch around the entire new block.
- **Secondary risk:** XSS via migrated labels — closed with mandatory `esc()`.
- **Perf:** one extra O(records × 15 items) pass per render over a single month's keys — negligible (≤ ~31 days × a few records).
- Rollback = delete the panel div, the CSS block, and the appended JS block; zero data cleanup needed.