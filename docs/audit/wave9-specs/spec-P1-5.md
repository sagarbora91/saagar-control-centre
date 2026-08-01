# P1-5

SUMMARY: P1-5 stamps who/when onto the stock day blob at every lock, movements-submit, and re-open: 8 new optional top-level fields (openingLockedBy/At, closingLockedBy/At, movementsSubmittedBy/At, reopenedCount, reopenLog[]) written inside toggleLock/doLockClosing/submitMovements plus a new mandatory-reason re-open sheet that replaces the silent unlock flips. Stamps surface as a "Day Audit Trail" strip on the Summary tab, an "Audit Trail" table appended to the A4 printSummaryReg document, and hover tooltips on the existing lock/submitted badges. Actor name comes from the shell's Wave-6 saagar_active_staff_v1 key (read-only) with an SM/CRO role fallback; all fields are defaulted in normaliseImportData (~L2283) in the Wave-9 one-pass carry edit; stock.html only, zero bridge/shell edits, no new localStorage keys.

NEW FIELDS: [
 {
  "field": "openingLockedBy",
  "where": "stock day blob saagar_stock_<store>_<date> (top level)",
  "type": "string (actor name or 'SM'/'CRO')",
  "default": "''"
 },
 {
  "field": "openingLockedAt",
  "where": "stock day blob saagar_stock_<store>_<date> (top level)",
  "type": "string (ISO datetime)",
  "default": "''"
 },
 {
  "field": "closingLockedBy",
  "where": "stock day blob saagar_stock_<store>_<date> (top level)",
  "type": "string",
  "default": "''"
 },
 {
  "field": "closingLockedAt",
  "where": "stock day blob saagar_stock_<store>_<date> (top level)",
  "type": "string (ISO datetime)",
  "default": "''"
 },
 {
  "field": "movementsSubmittedBy",
  "where": "stock day blob saagar_stock_<store>_<date> (top level)",
  "type": "string",
  "default": "''"
 },
 {
  "field": "movementsSubmittedAt",
  "where": "stock day blob saagar_stock_<store>_<date> (top level)",
  "type": "string (ISO datetime)",
  "default": "''"
 },
 {
  "field": "reopenedCount",
  "where": "stock day blob saagar_stock_<store>_<date> (top level)",
  "type": "number (non-negative integer)",
  "default": "0"
 },
 {
  "field": "reopenLog",
  "where": "stock day blob saagar_stock_<store>_<date> (top level)",
  "type": "array of {section:'opening'|'closing'|'movements', by:string, role:'sm'|'cro', at:ISO string, reason:string} (capped at 50, keep newest)",
  "default": "[]"
 }
]

NEW KEYS: []

BRIDGE CONTRACT: none — integration-bridge.js needs NO edit for P1-5. Its only touch of the stock day blob, consumeDsrToStock() at integration-bridge.js L317-332 (writes sb._dsrRollup at L329), does load-mutate-save of the parsed object, so the 8 new top-level fields survive untouched. P1-5's only cross-file dependency is a READ-ONLY peek at the shell's existing key saagar_active_staff_v1 (written by www/index.html signInStaff() L2197, ACTIVE_STAFF_KEY defined L1982) for the actor name; stock.html never writes that key.

# P1-5 — Stock Register lock/submit audit stamps (who + when + re-open count)

Effort S · Risk low · Module: **stock** (single-file change; no bridge, no shell edits)

---

## 1 · Target

**File:** `V:/Co work/Projects/Retail/_extracted_modules/stock.html` (decoded blob; re-embed via the scratchpad p1plan/embed.js pipeline). **No other file changes.**

| What | Function / anchor | Current line |
|---|---|---|
| Day-blob key scheme | `dataKey()` → `SK_PREFIX + st.store + '_' + st.date` = `saagar_stock_<store>_<date>` (`SK_PREFIX` L820) | L941 |
| Blob load / save | `loadData()` L943-959 (JSON.parse, keeps unknown fields) · `saveData(d)` L1008 | L943 / L1008 |
| Fresh-blob shape | `initData()` — `{ _v, openingLocked:false, closingLocked:false, movementsSubmitted:false, opening:{}, movements:{}, closing:{} }` | L961-970 |
| Opening lock + ALL unlocks | `toggleLock(section)` — SM-gated flip of `<section>Locked`; closing LOCK routes to `openPreLockSheet()` at L1863 | L1856-1869 |
| Closing lock (sign-off) | `doLockClosing()` — stamps `data.closingSignoff` (L1967-1974), sets `data.closingLocked = true` (L1975) | L1946-1981 |
| Movements submit | `submitMovements()` — sets `data.movementsSubmitted = true` | L1994-2004 |
| Movements re-open | `reopenMovements()` — SM-gated, sets flag false, **no reason, no trace** | L2006-2015 |
| Lock badges UI | `refreshLockUI(section,data)` (badges `#open-lock-badge` L496 / `#close-lock-badge` L588) · `renderMovementsHeader(data)` (badge `#mov-submitted-badge` L547) | L1983-1989 / L2029-2042 |
| Summary tab render | `renderSummary()`; cards container `<div class=\"scards\" id=\"sum-cards\">` | L1473-1561 / L640 |
| A4 register print | `printSummaryReg()` (builds body, ships via `stPrintDoc()` L2447 postMessage `ST_PRINT`) | L2599-2660 |
| **CARRY TRAP** | `normaliseImportData(parsed)` — top-level boolean defaulting block at L2283-2285 is where the new fields join the **Wave-9 one-pass edit** | L2238-2287 |
| Role determination | `st.mode` (`'cro'` default, `'sm'` after `smAuthSubmit()` L2097 → `commitMode()` L2118); state object `st` L864 | L864 / L2086-2131 |
| Actor-name source | Shell (www/index.html): `ACTIVE_STAFF_KEY = \"saagar_active_staff_v1\"` L1982, written by `signInStaff()` L2197 as `{id,name,employeeId,at}`, read by `activeStaff()` L2196. Stock already reads a shell-owned key directly — `getCROs()` L1010 reads `saagar_employee_master_v1` — so an in-module localStorage peek is established precedent. DSR precedent for the log shape: `dsr.html` `unlockLog.push({by, time, date, reason, ...})` L3016-3017. | — |
| Helpers reused | `esc()` L2432 · `stEsc()` L2446 · `_el()` L2438 · `toast()` L2683 · `roBlock()` L911 · modal pattern `#stock-lock-confirm` L788-800 + `clkValidate()` L1925 | — |

**P1-7 adjacency (theft gate — OUT of scope here):** P1-5's closing-lock edit is exactly **two stamp lines inserted immediately above `data.closingLocked = true;` (L1975) inside `doLockClosing()`**, plus an unlock re-route inside `toggleLock()` (L1864). P1-7 should add its theft gate at the **top** of `openPreLockSheet()` (L1893) / `doLockClosing()` (L1946) — before validation — or before the `openPreLockSheet()` route at L1863. No line overlap; the new re-open sheet uses fresh ids (`stock-reopen-confirm`, `rop-*`) so P1-7 may extend `#stock-lock-confirm` freely.

---

## 2 · Additive-safe — **TRUE**

- All 8 new fields are **optional, top-level** additions to the existing per-day blob `saagar_stock_<store>_<date>`. Nothing existing is renamed, retyped, or reshaped. `closingSignoff` (Wave 4) set the precedent for additive top-level stamps.
- **No new localStorage keys.** Actor name is a read-only peek at the shell's existing `saagar_active_staff_v1`.
- Top-level placement is deliberate: `normaliseImportData()` **rebuilds per-brand objects from a whitelist** (L2249-2280), so per-brand additions would be dropped by *old* builds on import; top-level unknown fields pass through untouched in both old and new builds. New-export → old-build import keeps stamps inert but intact; old-export → new-build import gets defaults from the carry edit.
- `validateImportSchema()` (L2222) needs **no change** — the fields are optional.
- The bridge's only stock-blob write, `consumeDsrToStock()` (integration-bridge.js L317-332, `sb._dsrRollup` at L329), is load-mutate-save: new fields survive.
- Behavioural delta (intentional, register-mandated): unlock/re-open now passes through a mandatory-reason sheet instead of flipping silently. Cancel = zero writes. Lock/submit flows are unchanged apart from stamping.

---

## 3 · Approach

### Step 1 — Actor helper + timestamp formatter (insert near `nowTime()`, after L885)

```js
/* P1-5: actor for audit stamps — the shell's signed-in named staffer (Wave6 #28,
   key saagar_active_staff_v1) when present, else the module role. Read-only peek
   at a shell-owned key; same precedent as getCROs() reading saagar_employee_master_v1. */
function stActor() {
  try {
    const a = JSON.parse(localStorage.getItem('saagar_active_staff_v1') || 'null');
    if (a && a.name) return String(a.name).slice(0, 60);
  } catch (e) {}
  return st.mode === 'sm' ? 'SM' : 'CRO';
}
/* P1-5: ISO → \"06 Jul, 07:42 pm\" (local, en-IN). Defensive: bad input echoes back. */
function fmtStamp(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }); }
  catch (e) { return String(iso); }
}
```

### Step 2 — Stamp the lock paths

**2a. `toggleLock()` (L1856-1869) — stamp on lock, re-route unlock to the audited sheet:**

```js
function toggleLock(section) {
  if (roBlock()) return;                                     // unchanged
  if (st.mode !== 'sm') { toast('Only SM can lock/unlock.', 'err'); return; }
  const data = loadData();
  const key  = section + 'Locked';
  if (section === 'closing' && !data.closingLocked) { openPreLockSheet(); return; }  // unchanged (P1-7 hooks near here)
  if (data[key]) { openReopenSheet(section); return; }       // P1-5: unlock = audited re-open, no silent flip
  data[key] = true;
  data[section + 'LockedBy'] = stActor();                    // P1-5 stamp
  data[section + 'LockedAt'] = new Date().toISOString();     // P1-5 stamp
  saveData(data);
  toast(`${section==='opening'?'Opening':'Closing'} stock locked 🔒`, 'ok');
  if (section === 'opening') renderOpening();
  else { renderMovements(); renderClosing(); }
}
```
(Only the closing-UNLOCK and opening lock/unlock legs reach this flip today; closing LOCK already detours at L1863, so the two stamp lines here cover **opening lock** and the re-lock-after-reopen case for both sections... note closing re-lock still routes through `openPreLockSheet()` → `doLockClosing()`, which stamps in 2b.)

**2b. `doLockClosing()` — two lines immediately above `data.closingLocked = true;` (L1975):**

```js
  data.closingLockedBy = stActor();                          // P1-5 stamp
  data.closingLockedAt = new Date().toISOString();           // P1-5 stamp
  data.closingLocked = true;                                 // existing L1975
```
`closingSignoff` (L1967) is left untouched — `closingLockedBy/At` is the single audit source.

### Step 3 — Stamp movements submit — `submitMovements()` (L1994), after `data.movementsSubmitted = true;` (L1997):

```js
  data.movementsSubmittedBy = stActor();                     // P1-5 (CRO submit is by design — no SM gate here)
  data.movementsSubmittedAt = new Date().toISOString();
```
Note: on re-submit after a re-open, By/At are **overwritten** with the latest submitter — the re-open itself is preserved in `reopenLog`.

### Step 4 — Audited re-open sheet (new modal + handlers)

**Markup** — insert after `#stock-lock-confirm`'s closing `</div>` (after L800), mirroring its structure:

```html
<!-- ══ P1-5 RE-OPEN / UNLOCK — AUDITED REASON SHEET ══ -->
<div id=\"stock-reopen-confirm\" class=\"modal-overlay\" style=\"display:none\" onclick=\"if(event.target===this)reopenCancel()\">
  <div class=\"modal-box\">
    <div class=\"modal-icon\">🔓</div>
    <h3 id=\"rop-title\">Re-open</h3>
    <p style=\"margin-bottom:10px;\">This day was signed off. Enter a reason — it is recorded in the audit trail with your name and time.</p>
    <input type=\"text\" class=\"si\" id=\"rop-reason\" placeholder=\"Reason for re-opening\" oninput=\"ropValidate()\">
    <div class=\"modal-err\" id=\"rop-err\"></div>
    <div class=\"modal-btns\">
      <button class=\"btn btn-navy btn-sm\" id=\"rop-confirm-btn\" disabled onclick=\"doReopenConfirm()\">🔓 Unlock &amp; Record</button>
      <button class=\"btn btn-outline btn-sm\" onclick=\"reopenCancel()\">Cancel</button>
    </div>
  </div>
</div>
```

**Handlers** — place next to `reopenMovements()` (~L2006):

```js
let _ropSection = null;
function openReopenSheet(section) {
  if (roBlock()) return;
  if (st.mode !== 'sm') { toast('Only SM can re-open.', 'err'); return; }
  _ropSection = section;
  const label = section === 'opening' ? 'Unlock Opening Stock'
              : section === 'closing' ? 'Unlock Closing Stock' : 'Re-open Day Movements';
  document.getElementById('rop-title').textContent = label;
  document.getElementById('rop-reason').value = '';
  document.getElementById('rop-err').textContent = '';
  document.getElementById('rop-confirm-btn').disabled = true;
  document.getElementById('stock-reopen-confirm').style.display = 'flex';
  setTimeout(() => document.getElementById('rop-reason').focus(), 80);
}
function ropValidate() {                                     // mirrors clkValidate() live-enable (L1925)
  const v = document.getElementById('rop-reason').value.trim();
  document.getElementById('rop-confirm-btn').disabled = !v;
  if (v) document.getElementById('rop-err').textContent = '';
}
function reopenCancel() { _ropSection = null; document.getElementById('stock-reopen-confirm').style.display = 'none'; }
function doReopenConfirm() {
  if (roBlock()) { reopenCancel(); return; }                 // never write on a past day
  if (st.mode !== 'sm') { toast('Only SM can re-open.', 'err'); reopenCancel(); return; }
  const section = _ropSection;
  if (!section) { reopenCancel(); return; }
  const reason = document.getElementById('rop-reason').value.trim();
  if (!reason) { document.getElementById('rop-err').textContent = 'Enter a reason to continue.'; return; }
  const data = loadData();                                   // fresh — mirror doLockClosing (L1949), no stale closure
  if (section === 'movements') data.movementsSubmitted = false;
  else data[section + 'Locked'] = false;                     // lockedBy/At intentionally NOT cleared — see Edge 2
  data.reopenedCount = (Number.isInteger(data.reopenedCount) ? data.reopenedCount : 0) + 1;
  if (!Array.isArray(data.reopenLog)) data.reopenLog = [];
  data.reopenLog.push({ section: section, by: stActor(), role: st.mode, at: new Date().toISOString(), reason: reason });
  if (data.reopenLog.length > 50) data.reopenLog = data.reopenLog.slice(-50);   // size guard, keep newest
  saveData(data);
  reopenCancel();
  if (section === 'opening') renderOpening();
  else if (section === 'closing') { renderMovements(); renderClosing(); }
  else { updateClosingTabState(data); renderMovementsHeader(data); }
  toast((section === 'movements' ? 'Day Movements re-opened'
        : (section === 'opening' ? 'Opening' : 'Closing') + ' stock unlocked 🔓') + ' — recorded in audit trail', 'warn');
}
```

**`reopenMovements()` (L2006-2015) becomes a thin wrapper** (button onclick at L549 keeps working, `applyReadOnlyChrome` forceHide list at L1178 still matches `btn-reopen-mov`):

```js
function reopenMovements() { openReopenSheet('movements'); }
```

### Step 5 — Surface the stamps (see §5 UI for exact copy)
- `renderSummary()` (L1473): call `renderSummaryAudit(data)` just after the `sum-cards` innerHTML assignment (L1549-1559), rendering into new `<div class=\"aud-strip\" id=\"sum-audit\">` placed after L640.
- `printSummaryReg()` (L2599): append an “Audit Trail — Who Signed Off” `stp-sec` to `body` **after the if/else, immediately before** the `stPrintDoc({...})` call at L2659, so it prints even for an empty brand list.
- Badge tooltips: one line each in `refreshLockUI()` (L1983) and `renderMovementsHeader()` (L2029) setting `badge.title` (plain-text DOM property — no esc needed).

### Step 6 — Defaults in `initData()` (L962) — keep fresh blobs shape-complete

```js
const d = { _v: SCHEMA_VERSION, openingLocked: false, closingLocked: false, movementsSubmitted: false,
            openingLockedBy:'', openingLockedAt:'', closingLockedBy:'', closingLockedAt:'',
            movementsSubmittedBy:'', movementsSubmittedAt:'', reopenedCount:0, reopenLog:[],
            opening: {}, movements: {}, closing: {} };
```

### Step 7 — CARRY edit in `normaliseImportData()` — see §4 (part of the Wave-9 one-pass edit)

---

## 4 · Data model & CARRY analysis

**New persisted fields — all on the stock day blob `saagar_stock_<store>_<date>`, all top-level, none per-brand:**

| # | Field | Type | Default | Written by |
|---|---|---|---|---|
| 1 | `openingLockedBy` | string | `''` | `toggleLock('opening')` lock leg |
| 2 | `openingLockedAt` | string (ISO) | `''` | same |
| 3 | `closingLockedBy` | string | `''` | `doLockClosing()` (above L1975) |
| 4 | `closingLockedAt` | string (ISO) | `''` | same |
| 5 | `movementsSubmittedBy` | string | `''` | `submitMovements()` |
| 6 | `movementsSubmittedAt` | string (ISO) | `''` | same |
| 7 | `reopenedCount` | non-negative int | `0` | `doReopenConfirm()` (+1 per re-open/unlock) |
| 8 | `reopenLog` | array of `{section:'opening'|'closing'|'movements', by:string, role:'sm'|'cro', at:ISO string, reason:string}`, cap 50 newest | `[]` | `doReopenConfirm()` (append-only) |

**New localStorage keys: NONE.** Read-only dependency on existing shell key `saagar_active_staff_v1`.

**Where defaulted in `normaliseImportData()` (~L2238):** append directly after the `movementsSubmitted` line (L2285), **inside the Wave-9 single joint edit** with the other stock items' fields:

```js
  /* ── Wave 9 P1-5: audit stamps (additive; top-level so old builds carry them through import) ── */
  if (typeof d.openingLockedBy      !== 'string') d.openingLockedBy      = '';
  if (typeof d.openingLockedAt      !== 'string') d.openingLockedAt      = '';
  if (typeof d.closingLockedBy      !== 'string') d.closingLockedBy      = '';
  if (typeof d.closingLockedAt      !== 'string') d.closingLockedAt      = '';
  if (typeof d.movementsSubmittedBy !== 'string') d.movementsSubmittedBy = '';
  if (typeof d.movementsSubmittedAt !== 'string') d.movementsSubmittedAt = '';
  d.reopenedCount = (Number.isInteger(d.reopenedCount) && d.reopenedCount >= 0) ? d.reopenedCount : 0;
  d.reopenLog = Array.isArray(d.reopenLog)
    ? d.reopenLog.filter(function(e){ return e && typeof e === 'object'; }).map(function(e){ return {
        section: (e.section==='opening'||e.section==='closing'||e.section==='movements') ? e.section : 'movements',
        by:      typeof e.by     === 'string' ? e.by     : '',
        role:    (e.role==='sm'||e.role==='cro') ? e.role : 'sm',
        at:      typeof e.at     === 'string' ? e.at     : '',
        reason:  typeof e.reason === 'string' ? e.reason : ''
      }; }).slice(-50)
    : [];
```

**Other blob-touching paths audited:** `loadData()` L943 keeps unknown fields (JSON round-trip); `prefillOpeningFromPrev()` L982 touches only `opening`; `saveData()` L1008 writes whole object; `exportJSON`/`exportAllJSON` L2343/2349 serialize wholesale; bridge `consumeDsrToStock()` L317-332 load-mutate-save. **No lossy path exists for top-level fields.** All readers stay defensive (`||''`, `Number.isInteger`, `Array.isArray`) because `loadData()` does **not** run normalise on legacy blobs.

---

## 5 · UI

**A. Summary tab — “Day Audit Trail” strip.** Markup: after `<div class=\"scards\" id=\"sum-cards\"></div>` (L640) add `<div class=\"aud-strip\" id=\"sum-audit\"></div>`. CSS (append near L137 table styles):

```css
.aud-strip { background:#fff; border:1px solid var(--gray-200,#e5e7eb); border-radius:10px; padding:10px 14px; margin:0 0 14px; font-size:12px; }
.aud-strip .aud-hd  { font-weight:700; color:var(--navy); text-transform:uppercase; font-size:11px; letter-spacing:.4px; margin-bottom:6px; }
.aud-strip .aud-row { padding:2px 0; color:var(--gray-600); }
.aud-strip .aud-row.aud-warn { color:var(--red); font-weight:600; }
.aud-strip .aud-log { padding:2px 0 2px 16px; color:var(--gray-600); }
```

Renderer (called from `renderSummary()` after L1559; also handle the empty-brands early-return at L1479-1485 by clearing `#sum-audit` there):

```js
function renderSummaryAudit(data) {
  const el = document.getElementById('sum-audit'); if (!el) return;
  const rows = [];
  rows.push(data.openingLocked
    ? '🔒 Opening locked by <strong>' + esc(data.openingLockedBy || '—') + '</strong>' + (data.openingLockedAt ? ' · ' + esc(fmtStamp(data.openingLockedAt)) : '')
    : '🔓 Opening not locked');
  rows.push(data.movementsSubmitted
    ? '✓ Movements submitted by <strong>' + esc(data.movementsSubmittedBy || '—') + '</strong>' + (data.movementsSubmittedAt ? ' · ' + esc(fmtStamp(data.movementsSubmittedAt)) : '')
    : '⏳ Movements not submitted');
  rows.push(data.closingLocked
    ? '🔒 Closing locked by <strong>' + esc(data.closingLockedBy || '—') + '</strong>' + (data.closingLockedAt ? ' · ' + esc(fmtStamp(data.closingLockedAt)) : '')
    : '🔓 Closing not locked');
  const n = Number.isInteger(data.reopenedCount) ? data.reopenedCount : 0;
  const log = Array.isArray(data.reopenLog) ? data.reopenLog : [];
  const logRows = log.map(u => {
    const lbl = u.section === 'opening' ? 'Opening' : u.section === 'closing' ? 'Closing' : 'Movements';
    return '<div class=\"aud-log\">' + esc(lbl) + ' re-opened by <strong>' + esc(u.by || '—') + '</strong> · ' + esc(fmtStamp(u.at)) + (u.reason ? ' — “' + esc(u.reason) + '”' : '') + '</div>';
  }).join('');
  el.innerHTML = '<div class=\"aud-hd\">Day Audit Trail</div>'
    + rows.map(r => '<div class=\"aud-row\">' + r + '</div>').join('')
    + '<div class=\"aud-row' + (n ? ' aud-warn' : '') + '\">' + (n ? '⚠ Re-opened <strong>' + n + '×</strong> after sign-off' : '✓ Never re-opened after sign-off') + '</div>'
    + logRows;
}
```
Every user-sourced string (`by`, `reason`) goes through `esc()` — names arrive via employee master / JSON import.

**B. A4 print — `printSummaryReg()` (L2599), insert before `stPrintDoc(...)` at L2659:**

```js
  const audRows = [
    ['Opening lock',      data.openingLocked      ? (data.openingLockedBy || '—')      + (data.openingLockedAt      ? ' · ' + fmtStamp(data.openingLockedAt)      : '') : 'Not locked'],
    ['Movements submit',  data.movementsSubmitted ? (data.movementsSubmittedBy || '—') + (data.movementsSubmittedAt ? ' · ' + fmtStamp(data.movementsSubmittedAt) : '') : 'Not submitted'],
    ['Closing lock',      data.closingLocked      ? (data.closingLockedBy || '—')      + (data.closingLockedAt      ? ' · ' + fmtStamp(data.closingLockedAt)      : '') : 'Not locked'],
    ['Re-opened',         (Number.isInteger(data.reopenedCount) && data.reopenedCount) ? data.reopenedCount + '× — see log' : 'Never']
  ];
  body += '<div class=\"stp-sec\"><div class=\"stp-sec-t\">Audit Trail — Who Signed Off</div>'
    + '<table class=\"stp-table\"><thead><tr><th>Step</th><th>By / When</th></tr></thead><tbody>'
    + audRows.map(r => '<tr><td>' + stEsc(r[0]) + '</td><td>' + stEsc(r[1]) + '</td></tr>').join('')
    + '</tbody></table>'
    + ((Array.isArray(data.reopenLog) && data.reopenLog.length)
        ? '<table class=\"stp-table\"><thead><tr><th>Re-opened</th><th>By</th><th>When</th><th>Reason</th></tr></thead><tbody>'
          + data.reopenLog.map(u => '<tr><td>' + stEsc(u.section === 'opening' ? 'Opening' : u.section === 'closing' ? 'Closing' : 'Movements') + '</td><td>' + stEsc(u.by || '—') + '</td><td>' + stEsc(fmtStamp(u.at)) + '</td><td>' + stEsc(u.reason || '') + '</td></tr>').join('')
          + '</tbody></table>' : '')
    + '</div>';
```

**C. Badge tooltips.** In `refreshLockUI()` (after L1987): `if (badge) badge.title = (locked && data[section+'LockedBy']) ? ('Locked by ' + data[section+'LockedBy'] + ' · ' + fmtStamp(data[section+'LockedAt'])) : '';` — and in `renderMovementsHeader()` (after L2036): `if (badge) badge.title = (submitted && data.movementsSubmittedBy) ? ('Submitted by ' + data.movementsSubmittedBy + ' · ' + fmtStamp(data.movementsSubmittedAt)) : '';`

**D. Exact copy (verbatim):** modal title per section — `Unlock Opening Stock` / `Unlock Closing Stock` / `Re-open Day Movements`; body — `This day was signed off. Enter a reason — it is recorded in the audit trail with your name and time.`; placeholder — `Reason for re-opening`; error — `Enter a reason to continue.`; buttons — `🔓 Unlock & Record` / `Cancel`; toasts — `Opening stock locked 🔒` · `Opening stock unlocked 🔓 — recorded in audit trail` (and Closing/Day-Movements variants) · `Only SM can re-open.`; strip lines as in §5A.

---

## 6 · Edge cases

1. **Legacy blobs (pre-Wave-9) without any new field** — `loadData()` does not normalise; every reader is defensive (`||''` / `Number.isInteger` / `Array.isArray`), so strips/prints render “Not locked / Never” cleanly. Import path defaults them via §4.
2. **Unlock leaves a stale `lockedBy/At`** — intentional: fields keep the *last* lock stamp; all display is gated on the boolean (`data.openingLocked ? ... : 'Not locked'`), and re-lock overwrites with the newer actor/time. History lives in `reopenLog`.
3. **Shared device, nobody signed in** — `stActor()` falls back to `'SM'` / `'CRO'` role strings: honest attribution of role even when anonymous (same limitation as shell Wave-6 #28 acknowledges).
4. **Past-day view (read-only)** — every new write path starts with `roBlock()` (`openReopenSheet`, `doReopenConfirm`); the trigger buttons are already force-hidden by `applyReadOnlyChrome()` L1178 and `body.st-readonly` CSS L427-428. Zero writes possible.
5. **CRO attempts unlock/re-open** — `openReopenSheet`/`doReopenConfirm` gate on `st.mode !== 'sm'` (matching `toggleLock` L1858 and old `reopenMovements` L2008). `submitMovements()` intentionally stays CRO-allowed (unchanged), so `movementsSubmittedBy` may legitimately be a CRO name/role.
6. **Forged/malformed import (`reopenLog: [{section:'bogus', reason:5}]`, `reopenedCount:'99'`)** — sanitised field-by-field in the §4 carry block; `esc()`/`stEsc()` at render kills any markup smuggled in `by`/`reason`.
7. **`reopenedCount` vs `reopenLog.length` divergence** (imported data, or log capped at 50) — `reopenedCount` is authoritative for the “N×” figure; never recompute from the log.
8. **Re-submit after re-open** — `movementsSubmittedBy/At` overwritten by the latest submit (latest-signature semantics); the intervening re-open is permanently in `reopenLog`. Same for re-lock.
9. **Bridge-created skeleton blob** (`consumeDsrToStock` creates `sb={}` + `_dsrRollup` when no day blob exists, L328) — unchanged pre-existing behaviour: such a blob fails `loadData()`'s try (no `opening`) and falls back to `initData()`; our fields neither worsen nor fix this.
10. **Sheet open while date/store switches underneath** (shell `st-date` event L2740 re-renders) — `doReopenConfirm()` re-runs `roBlock()` and does a fresh `loadData()` at confirm time, so it writes the *current* `dataKey()`; `_ropSection` is cleared on cancel. Residual: a store switch mid-sheet writes the new store's blob — same exposure class as the existing `#stock-lock-confirm` sheet, accepted.
11. **Modal stacking** — `openReopenSheet` is only reachable from lock/re-open buttons, never while `#stock-lock-confirm` is open (different lock directions), so no overlay stacking.

---

## 7 · Verify (browser harness — byte-exact `Copy-Item` shell copy, NEVER PowerShell Get/Set-Content; drive via `moduleFrame.contentWindow.eval` since module state is block-scoped to the iframe)

Let `F = document.getElementById('moduleFrame').contentWindow`, `K = 'saagar_stock_titanworld_' + todayISO`, `B = () => JSON.parse(localStorage.getItem(K))`.

1. **Fresh shape:** `F.eval(\"(function(){var d=initData();return JSON.stringify([d.reopenedCount,Array.isArray(d.reopenLog),d.openingLockedBy,d.movementsSubmittedAt]);})()\")` → `[0,true,\"\",\"\"]`.
2. **Named actor:** `localStorage.setItem('saagar_active_staff_v1', JSON.stringify({id:'e1',name:'Ramesh Kumar'}))` (set AFTER shell load — the shell's visibilitychange handler L6981 can sign out); `F.eval(\"stActor()\")` → `\"Ramesh Kumar\"`. Remove key; with `F.eval(\"st.mode='sm'\")` → `\"SM\"`.
3. **Submit stamp:** `F.eval(\"submitMovements()\")` → `B().movementsSubmitted===true`, `.movementsSubmittedBy` non-empty, `new Date(B().movementsSubmittedAt).getTime()` within ±60s of now.
4. **Lock stamp:** `F.eval(\"st.mode='sm'; toggleLock('opening')\")` → `B().openingLocked===true`, `.openingLockedBy` / `.openingLockedAt` set; badge `#open-lock-badge` title contains `Locked by`.
5. **Audited unlock:** `F.eval(\"toggleLock('opening')\")` → blob unchanged (`openingLocked` still true) AND `F.eval(\"getComputedStyle(document.getElementById('stock-reopen-confirm')).display\")==='flex'` with `#rop-confirm-btn` disabled. Then `F.eval(\"document.getElementById('rop-reason').value='Missed one brand'; ropValidate(); doReopenConfirm();\")` → `openingLocked===false`, `reopenedCount===1`, `reopenLog[0]` = `{section:'opening', by:'Ramesh Kumar'|'SM', role:'sm', reason:'Missed one brand'}` with parseable `at`. `openingLockedBy` still holds the last lock stamp (Edge 2).
6. **Movements re-open route:** re-submit, then `F.eval(\"reopenMovements()\")` → sheet opens (wrapper works); confirm with reason → `movementsSubmitted===false`, `reopenedCount===2`, `reopenLog[1].section==='movements'`.
7. **CRO guard:** `F.eval(\"st.mode='cro'; openReopenSheet('closing')\")` → sheet stays hidden, toast `Only SM can re-open.`, blob untouched.
8. **Past-day guard:** `F.eval(\"st.date='2020-01-01'; doReopenConfirm()\")` → no write under any `saagar_stock_titanworld_2020-01-01` key; roBlock toast fired. Reset `st.date`.
9. **CARRY round-trip:** `F.eval(\"JSON.stringify(normaliseImportData({store:'titanworld',date:'2026-07-01',data:{opening:{},movements:{},closing:{},reopenedCount:'99',reopenLog:[{section:'bogus',reason:5},null]}}).data)\")` → all 8 fields present; `reopenedCount===0`; `reopenLog` length 1 with `section:'movements'`, `reason:''`. Also import a REAL pre-Wave-9 `exportJSON` file through `importJSON` and assert defaults land.
10. **Summary strip:** with stamps + one re-open seeded, `F.eval(\"goTab('summary')\")` → `F.eval(\"document.getElementById('sum-audit').textContent\")` contains `Opening locked by`, `Re-opened 1×`, and the reason text; XSS probe: set `by:'<img src=x onerror=alert(1)>'` in blob → textContent shows literal string, no `img` element under `#sum-audit`.
11. **Print doc:** harness parent adds `window.addEventListener('message', e => e.data && e.data.type==='ST_PRINT' && (captured=e.data.html))`; `F.eval(\"printSummaryReg()\")` → `captured` contains `Audit Trail — Who Signed Off`, the actor name, and (with a re-open seeded) the Reason column row.
12. **Bridge survival (node test, reuse Wave-8 bridge harness):** seed `K` with stamps → run `consumeDsrToStock` with a matching DSR_SUBMITTED event → re-read `K`: `_dsrRollup` present AND all 8 P1-5 fields intact.

---

## 8 · Risk & blast radius

- **Files touched: 1** — `stock.html` (decoded blob → re-embed). No shell, no bridge, no report/whatsapp/demo-seed edits. No `saagar_exceptions` writes (nothing here is an exception item; P1-7 owns the theft-gate exception if any).
- **Storage:** additive fields on an existing per-day key; ~200 bytes/day typical, reopenLog capped at 50 entries. No new keys; no writes to shell-owned keys (`saagar_active_staff_v1` read-only).
- **Behaviour deltas (intentional):** (1) unlock/re-open now demands a reason via a sheet — Cancel aborts with zero writes; previously an instant flip. Matches the DSR P1-12 unlock precedent (mandatory reason, append-only log). (2) Lock/submit toasts unchanged except the split lock/unlock message in `toggleLock`.
- **Regression surface:** `toggleLock` restructure — guards (`roBlock`, SM gate, closing-lock detour at L1863) preserved verbatim; only callers are the two onclick buttons (L498, L590). `reopenMovements` kept as a named wrapper so the L549 onclick and the `applyReadOnlyChrome` forceHide id list (L1178) stay valid. `renderSummary`/`printSummaryReg` additions are append-only (existing tables/cards byte-identical).
- **P1-7 hand-off:** theft gate belongs at the top of `openPreLockSheet()` (L1893) / `doLockClosing()` (L1946) or before the L1863 detour — P1-5 occupies only the two stamp lines above L1975 and the `if (data[key]) { openReopenSheet(section); return; }` unlock re-route; ids `rop-*`/`stock-reopen-confirm` are namespaced clear of `clk-*`.
- **Worst credible failure:** a malformed `reopenLog` from a hand-edited import rendering oddly in the strip — mitigated by the §4 sanitiser + `esc()`/`stEsc()` at every sink; cannot corrupt counts or lock state since booleans drive all logic.