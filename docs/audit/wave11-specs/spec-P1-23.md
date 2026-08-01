# P1-23

SUMMARY: Prefill the T5 'Bills / Invoices Today' input (#nps-bills) from saagar_cro_audit_feed[date][kk(cro)].qmsSales, mirroring the existing autoFillGrooming() pattern: editable prefill with a '✓ auto from QMS' note, manual typing always wins, stale auto-values cleared on CRO/date switch, no prefill on feed miss, and no new persisted fields (value lands in existing tData.t5.billsCount via onNpsInput()).

NEW FIELDS: []

NEW KEYS: []

CROSS-FILE CONTRACT: none — reads only the existing bridge-written key saagar_cro_audit_feed[date][kk(cro)].qmsSales (already consumed by renderCroContext at cro_audit.html L2110); no new fields, keys, or bridge/EOD items.

SHARED REGIONS: [
 "onCroDateChange() (L2123-2131) — P1-24/P1-25 sibling specs may also hook this orchestrator",
 "buildNpsBody() T5 markup (L1056-1093) and onNpsInput() (L1211+) — if a sibling item touches T5",
 "loadAuditForEdit() (L2158-2198) — one-line dataset reset added near the grooming line L2189"
]

# P1-23 — CRO Audit: auto-fill 'Bills / Invoices Today' from the QMS feed

## Target
File: `V:/Co work/Projects/Retail/_extracted_modules/cro_audit.html` ONLY.
- `buildNpsBody(t,s)` — L1056; the `#nps-bills` input is L1063.
- `onNpsInput()` — L1211-1226 (writes `tData['t5'].billsCount`).
- Feed readers: `readCroFeed()` L2008, `croFeedEntry(date,cro)` L2009-2014, `kk()` L2006. Feed key: `localStorage['saagar_cro_audit_feed'][date][kk(croName)]` → entry fields incl. `qmsSales` (used at L2110 in `renderCroContext`).
- Precedent to mirror: `setGroomNote()` L2047-2058 + `autoFillGrooming()` L2059-2083 (incl. the cro-groom-stale `dataset.autoFilled` fix).
- Orchestrator: `onCroDateChange()` L2123-2131 (runs on `#f-cro`/`#f-date` change and at end of `buildTasks()` L1043 and `resetForm()` L1454).
- Edit loader: `loadAuditForEdit()` L2158-2198 (sets `nps-bills` via `setV` L2182, then `onNpsInput()` L2190).
- CSS to reuse: `.groom-note`, `.groom-note.auto`, `.groom-note.manual` L150-153.

## Additive-safe
TRUE. Pure UI prefill: no new localStorage keys, no new persisted fields (value flows into the existing `tData.t5.billsCount` via the existing `onNpsInput()` path), no bridge/EOD items, read-only consumption of an existing feed key. No normaliser impact (nothing new is stored).

## Approach
1. **Note helper** (place right after `setGroomNote`, ~L2058). Mirror it for T5; reuse `.groom-note` CSS:
```js
/* P1-23 — note under #nps-bills */
function setBillsNote(kind,text){
  const inp=document.getElementById('nps-bills'); if(!inp) return;
  let note=document.getElementById('bills-note');
  if(!text){ if(note) note.remove(); return; }
  if(!note){
    note=document.createElement('div');
    note.id='bills-note';
    inp.parentNode.appendChild(note); // inside the .mr cell, under the input
  }
  note.className='groom-note '+kind;
  note.textContent=text;
}
```
2. **Auto-fill function** (place after `autoFillGrooming`, ~L2083). EDITABLE — do NOT set readOnly (this is the deliberate divergence from grooming):
```js
/* P1-23 — prefill Bills/Invoices from QMS feed. Editable; manual wins. */
function autoFillBills(){
  const inp=document.getElementById('nps-bills'); if(!inp) return;
  const cro=(document.getElementById('f-cro')||{}).value;
  const date=(document.getElementById('f-date')||{}).value;
  const fe=croFeedEntry(date,cro);
  const has = fe && fe.qmsSales!=null && fe.qmsSales!=='';
  const untouched = inp.value==='' || inp.dataset.autoFilled==='1';
  if(has && untouched){
    inp.value=Math.round(Number(fe.qmsSales)||0);
    inp.dataset.autoFilled='1';
    setBillsNote('auto','✓ auto from QMS — edit if register differs');
    onNpsInput(); // score t5 via the existing path
  }else if(!has && inp.dataset.autoFilled==='1'){
    // stale-clear (mirror cro-groom-stale): don't carry one CRO's count to another
    inp.value=''; inp.dataset.autoFilled='';
    setBillsNote('',''); onNpsInput();
  } // manual value present (untouched===false, has feed) → leave alone, no note change
}
```
3. **Manual-override marker.** In `buildNpsBody` L1063 change the input's handler:
```html
<input class="minp" type="number" min="0" id="nps-bills" placeholder="0" oninput="npsBillsTouched();onNpsInput()">
```
and add (near `onNpsInput`):
```js
function npsBillsTouched(){
  const inp=document.getElementById('nps-bills'); if(!inp) return;
  inp.dataset.autoFilled='';
  setBillsNote('',''); // user typed → drop the 'auto' note
}
```
This is how auto-set (which calls `onNpsInput()` directly) is distinguished from user typing (which fires `oninput` → `npsBillsTouched` first).
4. **Wire orchestrator.** In `onCroDateChange()` (L2123) add `autoFillBills();` immediately after `autoFillGrooming();` (L2124). This covers boot, `#f-cro`/`#f-date` change, `buildTasks()` and `resetForm()` automatically.
5. **Edit-in-place guard.** `loadAuditForEdit()` calls `buildTasks()` (→ `onCroDateChange` → `autoFillBills` may set `dataset.autoFilled='1'`), THEN `setV('nps-bills', saved)` at L2182 overwrites the value — but the stale `'1'` flag would let a later date/CRO change clobber the SAVED value. Mirror the grooming reset at L2189: right after the `setV('nps-bills',...)` line add:
```js
const nb=document.getElementById('nps-bills'); if(nb){ nb.dataset.autoFilled=''; }
if(typeof setBillsNote==='function') setBillsNote('','');
```
6. No CSS additions (reuse `.groom-note auto/manual`); no 'manual' note is shown on feed miss (unlike grooming) — the field simply stays blank/manual, per the item brief.

## Data model & CARRY analysis
- New persisted fields: NONE. Prefill lands in the existing `tData['t5'].billsCount` (L1223) and is saved by the existing submit path unchanged.
- New localStorage keys: NONE. Reads existing `saagar_cro_audit_feed` (bridge-written, read-only here).
- Normaliser: cro_audit has no on-read normaliser for audits relevant here; nothing new to carry. Transient state lives only in `inp.dataset.autoFilled` (DOM, discarded on rebuild).

## UI
Under the 'Bills / Invoices Today' input (T5 card, first `.mrow`), a small pill note appears only when auto-filled:
- Copy: `✓ auto from QMS — edit if register differs` (class `groom-note auto`, teal).
- Note disappears the moment the SM types in the field. No note when the feed has no entry.

## Edge cases
1. Feed miss (no entry for date/CRO) → no prefill, no note; if a previous auto value was showing, it is cleared (stale-clear) and t5 rescored via `onNpsInput()`.
2. `qmsSales === 0` (entry exists, zero closed) → prefills `0` with the auto note (mirrors grooming's any-non-null behaviour; `!=null` check).
3. Manual value already typed, then CRO/date changed → `untouched===false` → never overwritten; note stays absent.
4. User manually clears the field to empty → `npsBillsTouched` drops the flag; a subsequent CRO/date change with a feed hit WILL re-prefill (field is empty ⇒ 'untouched'). Accepted: matches 'empty/untouched'.
5. Edit-in-place (`loadAuditForEdit`) → saved `billsCount` wins over the feed (step 5 flag reset); later field changes treat it as manual.
6. `#nps-bills` absent (T5 card not yet built) → `autoFillBills` early-returns; `buildTasks` re-invokes via `onCroDateChange` (L1043).
7. Feed JSON corrupt → `readCroFeed` already try/catches to `{}` → behaves as feed miss.
8. `qmsSales` non-numeric garbage → `Math.round(Number(x)||0)` → 0, never NaN in the input.

## Verify (browser harness, `moduleFrame.contentWindow.eval`)
Tab switcher function: **`go(viewId)`** (e.g. `go('audit')`, `go('home')`).
1. Seed: `localStorage.setItem('saagar_cro_audit_feed', JSON.stringify({'2026-07-12':{'priya sharma':{qmsSales:7,qmsNonPurch:2,groomingPct:90,dsrSubmitted:true,dsrSalesCount:6,dsrSalesAmt:12000}}}))`; reload module iframe; `go('audit')`.
2. Set `f-date`='2026-07-12', `f-cro`='Priya Sharma', call `onCroDateChange()`; assert `document.getElementById('nps-bills').value==='7'`, `dataset.autoFilled==='1'`, `#bills-note` exists with textContent containing 'auto from QMS', and `tData.t5.billsCount===7`.
3. Simulate typing: set `nps-bills.value='9'`, call `npsBillsTouched();onNpsInput()`; change `f-date` to another day with a feed hit, call `onCroDateChange()`; assert value stays '9' and no `#bills-note`.
4. Stale-clear: auto-fill again (clear value first), then switch `f-cro` to a name with NO feed entry, `onCroDateChange()`; assert `nps-bills.value===''` and `tData.t5.billsCount===0`.
5. Edit-in-place: submit an audit with billsCount 3, `loadAuditForEdit(id)`; assert `nps-bills.value==='3'` and `dataset.autoFilled===''`.
6. Grooming regression: `#groom-pct` still auto-fills to 90 read-only with its own note (proves no interference).
7. Console: zero errors across all steps.

## Risk & blast radius
LOW. Purely additive UI in one blob: one new `oninput` prefix on `#nps-bills`, three small new functions, one call added to `onCroDateChange`, one flag-reset line in `loadAuditForEdit`. No storage writes, no bridge/EOD items, no shell edits, no exceptions produced. Worst failure = wrong prefill number, which the SM can overtype (field stays editable). Main regression surface is `loadAuditForEdit` ordering — covered by step 5 verification.