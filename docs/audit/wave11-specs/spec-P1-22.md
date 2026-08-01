# P1-22

SUMMARY: Stamp three flat optional fields (checkedBy, checkedByRole, checkedAt) onto each grooming record inside the single save path saveCRO() (grooming.html L742-791, record literal L765-770), actor resolved by a new grmActor() helper that peeks the shell's saagar_active_staff_v1 (stock stActor() precedent) with saagar_current_role_v1 as role fallback; render "checked by <name> · <time>" on the daily card sub-line (renderDaily L873) plus a small non-blocking '⚠ self-checked' marker when checker name equals the checked employee's name (case/trim-insensitive); month view untouched (records are re-projected per-day so per-check checker is not cheap there). Grooming has NO on-read normaliser (getDay is a raw JSON.parse), so all render code must treat the fields as absent on legacy records.

NEW FIELDS: [
 {
  "field": "checkedBy",
  "where": "each record in grooming day arrays saagar_grooming_YYYY-MM-DD (flat field on the record object, module style)",
  "type": "string (staff name, sliced to 60 chars) ",
  "default": "undefined (legacy records; render falls back to hiding the line)",
  "carried_in": "no normaliser exists in grooming.html — getDay() (L544) returns raw parsed records, so no carry site; renderDaily/exportCSV must null-guard instead"
 },
 {
  "field": "checkedByRole",
  "where": "same record object",
  "type": "string (shell role, e.g. 'Store Manager'/'CRO')",
  "default": "undefined",
  "carried_in": "none (no normaliser); render null-guards"
 },
 {
  "field": "checkedAt",
  "where": "same record object",
  "type": "string ISO datetime (new Date().toISOString())",
  "default": "undefined",
  "carried_in": "none (no normaliser); render null-guards"
 }
]

NEW KEYS: []

CROSS-FILE CONTRACT: Reads (read-only peek, no writes) two shell-owned keys: saagar_active_staff_v1 (shape {id,name,employeeId,at} — NO role field, written by shell signInStaff() at www/index.html L2197) and saagar_current_role_v1 (plain string role, shell L2017/L2033). No other Wave-11 file reads or writes these grooming fields.

SHARED REGIONS: [
 "saveCRO() record literal, grooming.html L765-770 — P1-21 edits the SAME literal (coordinate: P1-22 appends its three fields after P1-21's; both are pure additions to the object literal)",
 "renderDaily() card template, grooming.html L866-883 (cro-info-sub line L873) — if P1-20/21 touch the daily card, merge markup edits"
]

# P1-22 — Grooming: checkedBy accountability stamp

## Target
- File: `V:/Co work/Projects/Retail/_extracted_modules/grooming.html` ONLY (decoded blob; re-embed via scratchpad p1plan/embed.js pipeline).
- Functions: `saveCRO()` L742-791 (the ONLY save path — `saveRecord()` L537 has exactly one caller, L772; there is no bulk-save-all in this module), `renderDaily()` L811-886 (card template L866-883, sub-line L873), `exportCSV()` L1036+ (optional column), helper block near `esc()` L810.
- Tab switcher: `go(id)` at L592 (tabs: checklist / daily / monthly).

## Additive-safe
TRUE. Three new OPTIONAL flat fields on existing per-day record objects in `saagar_grooming_YYYY-MM-DD` arrays; no key renamed/reshaped; no new localStorage key. Grooming has NO on-read normaliser — `getDay()` (L544) is `JSON.parse(localStorage.getItem(STORE+dateStr)||'[]')` raw — so the drop-on-normalize trap does not apply here; instead every reader must null-guard (legacy records and records saved by old APKs will lack the fields forever). Shell keys are read-only peeks (exact precedent: stock.html `stActor()` L988-994).

## Approach
1. **Actor helper** — add near `esc()` (after L810), mirroring stock's `stActor()` but with role fallback from the shell's device-role key (the active-staff object has NO role field — verified shape `{id,name,employeeId,at}` at shell L2197):
```js
/* P1-22: actor for the checkedBy stamp — the shell's signed-in named staffer
   (Wave6 #28, key saagar_active_staff_v1) when present; role from the shell's
   device role key. Read-only peeks; precedent = stock stActor() / grmEmployees(). */
function grmActor(){
  var name='', role='';
  try{ var a=JSON.parse(localStorage.getItem('saagar_active_staff_v1')||'null');
       if(a&&a.name) name=String(a.name).slice(0,60); }catch(e){}
  try{ var r=localStorage.getItem('saagar_current_role_v1');
       if(r) role=String(r).slice(0,40); }catch(e){}
  return { name: name || (role||'Staff'), role: role||'' };
}
```
   (When nobody is signed in, name falls back to the role string — same honesty level as stock's `'SM'/'CRO'` fallback.)
2. **Stamp at save** — in `saveCRO()`, extend the record literal L765-770 (COORDINATE: P1-21 edits this same literal; both changes are plain appended properties):
```js
  const __actor = grmActor();          // P1-22
  const record = {
    name, gender: g, pct, checked, total, items,
    date: todayKey(),
    time: now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),
    attempt: __attempt,
    /* …P1-21 fields here… */
    checkedBy: __actor.name,           // P1-22 accountability stamp
    checkedByRole: __actor.role,       // P1-22
    checkedAt: now.toISOString()       // P1-22
  };
```
   Both entry routes (`startCL()` normal check and `startRecheck()` Wave-4 re-check) funnel into this one `saveCRO()`, so both are stamped with one edit.
3. **Self-check detection (render-time, computed — never stored)**:
```js
function grmIsSelfCheck(rec){
  return !!(rec && rec.checkedBy && rec.name &&
    String(rec.checkedBy).trim().toLowerCase()===String(rec.name).trim().toLowerCase());
}
```
4. **Daily card display** — in `renderDaily()`, replace the sub-line at L873:
```js
    // P1-22: checker attribution (legacy records without checkedBy show nothing extra)
    const chkLine = rec.checkedBy
      ? ` &nbsp;·&nbsp; checked by ${esc(rec.checkedBy)}${grmIsSelfCheck(rec)
          ? ' <span style=\"color:#b45309;font-weight:600\" title=\"Checker name matches the employee being checked\">⚠ self-checked</span>'
          : ''}`
      : '';
```
   and change L873 to:
```html
<div class="cro-info-sub">${rec.gender==='m'?'Male':'Female'} CRO &nbsp;·&nbsp; ${rec.time}${chkLine}</div>
```
   `rec.time` is already the check time in en-IN 12-hour form, so the register's "checked by Priya · 9:41 am" reads naturally as `… · 9:41 am · checked by Priya` — do NOT print `checkedAt` a second time on the card. `esc()` MANDATORY on `checkedBy` (names travel via migration; existing xss-grooming-names audit fix precedent at L808-810).
5. **Month view** — SKIP the table (renderMonthly L934+ re-aggregates into per-CRO `croMap` records `{date,pct,checked,total}` at L946; carrying per-check checker there means new columns and multi-checker collapse logic — not "cheap"). Instead, the cheap option: add `checkedBy` to **CSV export** — in `exportCSV()` (L1036+) extend the header `['Date','CRO Name','Gender','Score %','Checked','Total','Time']` with `'Checked By','Self-Check'` and each row with `r.checkedBy||''` and `grmIsSelfCheck(r)?'YES':''`. This gives month-level auditability without touching the ranking table. (If the implementation owner finds the CSV row builder quotes fields, follow its existing quoting.)
6. **No blocking anywhere** — self-check is a read-only marker; do NOT alter `grmNameAvailable`, the 2/day cap, or the fail-gate.

## Data model & CARRY analysis
| Field | Type | Default | Carry |
|---|---|---|---|
| `checkedBy` | string ≤60 | absent (legacy) | No normaliser exists in grooming (getDay L544 is raw parse) → nothing to carry; every reader null-guards (`rec.checkedBy ?`) |
| `checkedByRole` | string ≤40 | absent | same |
| `checkedAt` | ISO string | absent | same |

No new localStorage keys. Shell keys `saagar_active_staff_v1` / `saagar_current_role_v1` are READ only. `deleteRecord`/`clearDayData` and the migration exporter pass whole record objects through untouched, so the fields survive delete-reindex and backup/restore automatically.

## UI
- Daily Summary card sub-line (under the name): `Male CRO · 9:41 am · checked by Priya` — and when self-checked: `… · checked by Priya ⚠ self-checked` (amber `#b45309`, `title="Checker name matches the employee being checked"`). Legacy records: line unchanged from today.
- CSV export: two new trailing columns `Checked By`, `Self-Check` (`YES`/blank).
- No new buttons, no modals, no toast copy changes.

## Edge cases
1. **No staff signed in** — `saagar_active_staff_v1` absent → `checkedBy` = role string (e.g. `checked by Store Manager`); still honest, never blank-crashes.
2. **Legacy / old-APK records** without the fields — `chkLine` = '' ; CSV cells blank; `grmIsSelfCheck` false. No normaliser to patch.
3. **Self-check name match** must be trim+lowercase compare (record names come from the employee-master datalist but are free-text editable).
4. **Checker changes mid-day** — each record carries its own stamp; re-check (attempt 2) may legitimately have a different `checkedBy` than attempt 1 — no reconciliation.
5. **XSS** — `checkedBy` reaches innerHTML → must go through `esc()` (card) and CSV-quote (export).
6. **Corrupt shell keys** — both peeks are try/catch'd; a garbage `saagar_active_staff_v1` degrades to role fallback, never throws inside `saveCRO()`.
7. **Past-date view** — `renderDaily` on a past date shows the stamp read-only (no save path exists there; `isPastView()` guard L743 unchanged).
8. **P1-21 same-literal collision** — implementation owner applies P1-21's fields first, then appends P1-22's three; one combined literal, one `__actor` const.
9. **Field-length abuse via restored backups** — display slices are enforced at write (`.slice(0,60)`/`(0,40)`); render side tolerates longer legacy strings (esc'd, CSS wraps).

## Verify (browser harness, module iframe)
Tab switcher: `go(id)` — e.g. `moduleFrame.contentWindow.eval("go('daily')")`.
1. Seed actor: `localStorage.setItem('saagar_active_staff_v1', JSON.stringify({id:'e1',name:'Priya',employeeId:'E1',at:new Date().toISOString()})); localStorage.setItem('saagar_current_role_v1','Store Manager')` (from the SHELL window, then reload module).
2. `moduleFrame.contentWindow.eval("grmActor().name")` → `'Priya'`; role → `'Store Manager'`.
3. Save a check for employee "Ravi" via UI (or eval-drive `startCheckFor('Ravi')`, tick, `saveCRO()`), then: `moduleFrame.contentWindow.eval("JSON.parse(localStorage.getItem('saagar_grooming_'+todayKey())).slice(-1)[0].checkedBy")` → `'Priya'`; also assert `checkedAt` parses (`!isNaN(new Date(x))`) and `checkedByRole==='Store Manager'`.
4. `go('daily')` → daily card HTML contains `checked by Priya` and does NOT contain `self-checked`.
5. Save a check for employee "Priya" (same as actor) → card contains `⚠ self-checked`; `grmIsSelfCheck` true; save NOT blocked (record count grew).
6. Legacy tolerance: push a field-less record `{name:'Old',gender:'f',pct:80,checked:8,total:10,items:[],date:todayKey(),time:'9:00 am'}` into the day key, `renderDaily()` → no console error, card renders without a checked-by segment.
7. Remove `saagar_active_staff_v1`, save again → `checkedBy==='Store Manager'` (role fallback).
8. `exportCSV()` path: eval the row-builder over the day and assert the `Checked By` column carries `Priya` and `Self-Check` shows `YES` only on the Priya-checks-Priya row.
9. Zero console errors across all steps.

## Risk & blast radius
LOW. One save-site literal append, one render sub-line, one CSV column, two read-only shell-key peeks. No bridge/EOD surface (grooming emits no buildExceptions items in this item), no shell edit, no new key. Worst plausible failure: a malformed helper throwing inside `saveCRO()` would block grooming saves — mitigated by try/catch around both peeks and by helper being pure. Coordinate ONLY with P1-21 (same record literal) and P1-20/21 if they restyle the daily card.