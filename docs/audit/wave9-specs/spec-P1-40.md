# P1-40

SUMMARY: Add one read-only check to buildExceptions() in integration-bridge.js that counts QMS followups[] with status 'Pending' and dueDate <= today (overdue included, with an '(N overdue)' breakdown) and pushes ONE aggregate item {sev:'med', area:'QMS', msg:'N follow-up(s) due…', at:today} into the saagar_exceptions blob it already rebuilds wholesale each cycle. Tap-routing needs zero shell changes: area 'QMS' is already mapped in EXC_AREA_TO_MODULE so the Home attention card gets a 'Fix' button that opens QMS — which is exactly the same landing the universal-search 'followups' deep-link produces today, because qms.html never consumes ST_OPEN_FEATURE targets. Scope is QMS followups only (DSR's Wave-8 non-buyer pipeline is derived, has no due-date ledger, and would double-count bridge-pushed non-purchase rows).

NEW FIELDS: []

NEW KEYS: []

BRIDGE CONTRACT: integration-bridge.js buildExceptions() APPENDS one item of the EXISTING shape {sev:'med', area:'QMS', msg:<count string>, at:<YYYY-MM-DD>} to saagar_exceptions.items (blob shape {date, items, generatedAt} unchanged, still rebuilt + overwritten wholesale every cycle at ~L569). The shell reads it unchanged: renderHome() exceptions block (index.html L3252-3266) routes the tap via EXC_AREA_TO_MODULE['QMS']→navigateToModule('qms') (L3013), renderSync() (L2848-2852) shows it as a banner. CONSTRAINT the msg must honour forever: it must NEVER match /open lead/i, because buildCloseDaySteps() (index.html L3070) filters area-'QMS' items with that regex for the EOD wizard's 'Close QMS leads' step — 'follow-up(s) due' does not match. Read side: bridge reads retail_queue_management_v1 .followups[] fields {status, dueDate} READ-ONLY (never writes the QMS blob).

# P1-40 — 'Follow-ups due today' exception on Home / Exceptions Hub

**Effort S · risk low · bridge-only (no blob re-embed, no APK base64 step — integration-bridge.js is a plain file loaded by the shell).**

## Target

| File | Function | Lines (current) | Change |
|---|---|---|---|
| `V:/Co work/Projects/Retail/saagar-control-centre/www/integration-bridge.js` | `buildExceptions(bus)` | L524–571; **QMS block L535–539** is the insertion point | EXTEND the existing "QMS open leads today" try-block with a followups count + one `ex.push(...)` |

**Read-only reference anchors (NO edits):**
- bridge: `today()` L63 (LOCAL date), `L()` L65, `QMS='retail_queue_management_v1'` L31, `EXC='saagar_exceptions'` L41, sev-sort L568, `S(EXC,{date:d,items:ex,generatedAt})` L569, `cycle()` calls `buildExceptions(bus)` L740; cadence = init L804, 60s tick L806 (`TICK=60000` L45), storage-event debounced 4s L807+L712-719, iframe-load +50ms L800, manual `SaagarBridge.runNow()` L744 (Sync "Run now" index.html L2820; EOD wizard L3119).
- shell `www/index.html`: `EXC_AREA_TO_MODULE` **L3013** (`'QMS':'qms'` already mapped); `renderHome()` (starts L3149) exceptions block **L3252–3266** (item → `{title:'${x.area}: ${x.msg}', action:navigateToModule('<mid>'), cta:'Fix'}`, high=unshift/red, med/low=push/orange, list `slice(0,6)` L3269, bell dot L3272); `renderSync()` exception banners **L2848–2852** (display-only); `buildCloseDaySteps()` **L3058–3088** (QMS step filters `/open lead/i` at **L3070**; stale-day blob ignored at L3065); universal search `FEATURE_INDEX` followups target **L3517**; `navigateToFeature`/`forwardFeatureTarget` **L3538–3557**; injected iframe bootstrap handling `ST_OPEN_FEATURE` **L6643**.
- `_extracted_modules/qms.html`: `todayISO` **L388** (LOCAL date — audit-fixed for IST); `initialState()` with `followups:[]` **L424**; load-time `state.followups=state.followups||[]` **L425**; nav badge predicate `state.followups.filter(f=>f.status==='Pending'&&f.dueDate<=todayISO()).length` **L465**; dashboard attention `'N follow-up(s) due today'` **L472**; followup creation shape **L565**; `updateFollowup` (→'Done'/'Lost') **L567**; `confirmConvertFollowup` (→'Converted') **L570**.
- `www/demo-seed.js` L530: seeded followups use the SAME shape, `dueDate` via `ymd()` = `YYYY-MM-DD`, statuses `Pending/Done/Converted/Lost`.

## Additive-safe — TRUE

- Zero new localStorage keys; zero new fields on any module blob. The ONLY write remains the bridge's existing wholesale rebuild of `saagar_exceptions` (already rebuilt from scratch every cycle — L526 `ex=[]` … L569 `S(EXC,...)`), which gains at most ONE extra item of the EXISTING item shape `{sev,area,msg,at}`.
- The QMS blob is read via the already-parsed `q` local — **never written** (hard rule honoured: bridge exception work writes ONLY `saagar_exceptions`).
- Removal of this code restores prior behaviour exactly; a stale blob from an older build is overwritten on the next cycle.

## Approach

**Decision 1 — overdue included: YES.** QMS's own badge/attention predicate (qms.html L465/L472) is `status==='Pending' && dueDate<=todayISO()` — overdue already included there. Per the Wave-4 grooming precedent in this very function (bridge L529-530: "Mirrors the grooming module's … predicate so the module panel and this hub count agree"), the bridge MUST mirror the module's predicate so the hub number always equals the QMS nav-badge number. Copy adds an `(N overdue)` breakdown for actionability.

**Decision 2 — tap-action / deep-link: `area:'QMS'`, no shell change.** Finding: existing exception items carry **no** action/target field at all — the shell DERIVES the tap from `area` via `EXC_AREA_TO_MODULE` (index.html L3013), giving `navigateToModule('qms')` + cta 'Fix' (L3260-3262); unmapped areas fall back to "open Sync". Matching the existing encoding EXACTLY therefore means emitting `area:'QMS'` (already mapped). Note on the register's "deep-link to followups": the `ST_OPEN_FEATURE` target `'followups'` (FEATURE_INDEX L3517) is delivered to the iframe by the shell bootstrap (L6643 sets `window.__stTarget` + dispatches `st-feature`), **but qms.html contains zero consumers of `__stTarget`/`st-feature`** (verified: 0 grep hits), and `forwardFeatureTarget`'s fallback tab-switch names (`stOpenFeature/switchTab/showTab/gotoTab`, L3553) do not include QMS's actual `switchView`. So even the universal-search deep-link lands on the QMS dashboard today. `area:'QMS'` produces the IDENTICAL landing with zero new code — and on landing, QMS's own dashboard attention row "N follow-up(s) due today" (L472, tap → followups view) and the red `navBadgeFu` (L465) carry the user the last tap with the SAME count. A true tab-deep-link would require editing the qms blob + shell renderer — out of scope for this bridge-only S item; if wanted later it is its own item.

**Decision 3 — scope: QMS followups ONLY (not DSR's Wave-8 pipeline).** Justification: (1) the register asks for QMS follow-ups — promised call-backs with a due DATE; (2) DSR's Wave-8 non-buyer pipeline is **derived at render time** from prior-day `nonpurch[]` rows (`scanFollowUps`, dsr.html L1616+, matching by `_fuRef`/`_fuSig`, flag `followedUp`) — it is a rolling ≤3-day worklist with **no status/dueDate ledger**, so "due today" has no meaning there; (3) **double-count risk**: a QMS non-purchase close is bridge-pushed INTO DSR `nonpurch[]` (consumeQmsToDsr, bridge L222) — the same customer would be counted by both sources; (4) counting DSR would force the bridge to scan every `saagar_dsr_*` key and re-derive `_fuSig`/`followedUp` logic — duplication + drift. 

**Step 1 (the only step).** In `buildExceptions()`, replace the current L535-539 block:

```js
      // QMS open leads today
      try{ var q=L(QMS,null); if(q&&Array.isArray(q.customers)){
        var open=q.customers.filter(function(c){var t=(c.exitTime||c.entryTime||c.walkInTime||'')+'';return t.slice(0,10)===d && !(c.outcome) && !/closed/i.test(String(c.status||''));}).length;
        if(open) ex.push({sev:'med',area:'QMS',msg:open+' open lead(s) not closed today',at:d});
      } }catch(e){}
```

with (open-leads logic byte-identical; followups check added as a SIBLING `if` inside the same try so the already-parsed `q` is reused — no second JSON.parse of the largest blob in the app, and a legacy blob with no `customers` array still gets its followups counted):

```js
      // QMS open leads today (+ P1-40: promised call-backs due)
      try{ var q=L(QMS,null); if(q&&Array.isArray(q.customers)){
        var open=q.customers.filter(function(c){var t=(c.exitTime||c.entryTime||c.walkInTime||'')+'';return t.slice(0,10)===d && !(c.outcome) && !/closed/i.test(String(c.status||''));}).length;
        if(open) ex.push({sev:'med',area:'QMS',msg:open+' open lead(s) not closed today',at:d});
      }
      /* P1-40: Pending follow-ups with dueDate <= today (OVERDUE INCLUDED — a promised call-back stays
         urgent until made). MIRRORS the QMS module's own navBadgeFu / dashboard predicate
         (state.followups.filter(f=>f.status==='Pending'&&f.dueDate<=todayISO()), qms.html ~L465/L472),
         both sides on LOCAL dates, so the hub count always equals the QMS badge. Read-only: the QMS blob
         is never written. ONE aggregate item; ex[] is rebuilt from scratch every cycle (S(EXC,...) below
         overwrites wholesale), so no dedup state exists to manage. area 'QMS' rides the existing
         EXC_AREA_TO_MODULE routing (tap on Home → opens QMS). msg must NEVER match /open lead/i —
         the shell's buildCloseDaySteps filters area-'QMS' items with that regex for the EOD wizard. */
      if(q&&Array.isArray(q.followups)){
        var fuDue=0, fuOver=0;
        q.followups.forEach(function(f){
          if(!f || f.status!=='Pending') return;
          if(typeof f.dueDate!=='string' || !f.dueDate) return;     // missing/empty/non-string dueDate never counts, never throws
          if(f.dueDate<=d){ fuDue++; if(f.dueDate<d) fuOver++; }    // lexicographic YYYY-MM-DD compare — same as QMS
        });
        if(fuDue) ex.push({sev:'med',area:'QMS',msg:fuDue+' follow-up(s) due'+(fuOver?' ('+fuOver+' overdue)':'')+' — see Follow-ups',at:d});
      }
      }catch(e){}
```

Notes for the implementer:
- `d` is `buildExceptions`'s existing local `var d=today()` (L526) — local date, same axis as qms `todayISO()` (L388).
- Severity `'med'`: same tier as the sibling "open lead(s)" item; `'high'` in this hub is reserved for floor-gate blocks, cash mismatch and after-close unsubmitted DSR (L527/547/566). Med renders orange, appended (not prepended) on Home.
- The sev-sort at L568 is stable in all modern engines, so the follow-ups item stays adjacent to (after) the open-leads item.
- Everything downstream of the insertion shifts by ~+18 lines (Stock check currently L541, sort L568, write L569).

## Data model & CARRY analysis

- **New persisted fields: NONE.** The pushed item uses the EXISTING exception item shape `{sev,area,msg,at}` (all strings), inside the EXISTING `saagar_exceptions` blob `{date,items,generatedAt}` (L569). The blob is fully derived — rebuilt from scratch and overwritten every cycle — so nothing needs migration, defaulting, or restore handling (a restored stale blob is replaced on the first cycle after boot).
- **New localStorage keys: NONE.**
- **stock.html `normaliseImportData()` (~L2238) carry: N/A** — this item touches no stock field and no module blob; nothing to add to the Wave-9 one-pass carry.
- **Fields READ (unchanged, read-only):** `retail_queue_management_v1` → `followups[]` rows `{status:'Pending'|'Done'|'Converted'|'Lost', dueDate:'YYYY-MM-DD'}` (creation qms.html L565 from `<input type=date>`; seed demo-seed.js L530 via `ymd()` — both date-only strings).

## UI (no new surfaces — existing renderers pick the item up automatically)

Exact copy (singular/plural via the house `(s)` idiom, counts are small integers so no `toLocaleString` needed; no user strings in msg so nothing to `esc()` — the shell `escapeHtml()`s title/msg anyway at L3269/L2851):
- `msg` = `"3 follow-up(s) due (1 overdue) — see Follow-ups"` — the `(N overdue)` part only when ≥1 overdue; with none: `"2 follow-up(s) due — see Follow-ups"`.
- **Home attention card** (renderHome L3252-3266): orange dot, ⚠️, title `"QMS: 3 follow-up(s) due (1 overdue) — see Follow-ups"`, sub-line (shell's own) `"Cross-module flag — opens the module that fixes it."`, button **Fix** → `navigateToModule('qms')`. Bell dot (L3272) lights.
- **Settings ▸ Sync ▸ Exceptions** (renderSync L2850-2852): amber-left-border banner `**QMS** — 3 follow-up(s) due (1 overdue) — see Follow-ups (med)`.
- `"— see Follow-ups"` is deliberate: the tap lands on the QMS dashboard (see Decision 2), and "Follow-ups" is QMS's exact nav label (L350), where `navBadgeFu` shows the SAME number.

## Edge cases

1. **QMS key absent** (fresh install / demo seed off): `L(QMS,null)` → `q=null` → both `if`s skip → no item, no throw.
2. **Legacy blob without `followups`** (pre-followups data or `{customers:[]}` only): `Array.isArray(q.followups)` guard → skip. Blob whose `followups` is corrupt (object/string): same guard.
3. **Malformed/missing dueDate**: `null`/`undefined`/number → excluded by `typeof==='string'`; `''` → excluded by truthiness (deliberate micro-divergence: QMS's raw `''<=today` would count an empty date, but `''` is impossible via UI L565 — date required — and via seed; we refuse to count garbage); `'31/12/2025'` → `'3'>'2'` lexicographically → excluded, same as QMS. A datetime string `'2026-07-05T18:00'` behaves exactly as in QMS (yesterday-datetime counts, today-datetime doesn't) because we compare the RAW string like QMS does instead of slicing — parity beats normalisation.
4. **Rows that are `null`/non-object** in followups[]: `if(!f)` guard.
5. **Statuses `Done`/`Converted`/`Lost` or missing**: excluded (`!=='Pending'`), identical to the QMS badge (missing-status rows are invisible in QMS too).
6. **Future dueDate**: excluded (`<=d` fails); appears the day it falls due.
7. **Zero due**: NO item pushed (absence, never "0 follow-up(s) due") — matches every sibling check's `if(count)` pattern.
8. **Dedup across rebuilds**: structural — `ex` starts `[]` each call and `S(EXC,...)` overwrites the whole blob, so exactly 0-or-1 follow-up items can ever exist; running `runNow()` N times never stacks.
9. **Huge counts** (followups are never pruned in QMS; seeded data alone has dozens): one O(n) pass per cycle with two integer counters — no allocation, no msg growth (aggregate count only). Home shows only 6 items (`slice(0,6)` L3269) — on a heavy exception day the med item may not fit Home; it always shows in Sync. Accepted, same as every other med item.
10. **Midnight rollover / stale blob**: next cycle recomputes with the new local `d`; `buildCloseDaySteps` already ignores a yesterday-dated blob (L3065); `cycle()` runs at shell init (L804) so the blob is fresh on every app open.
11. **EOD-wizard collision**: the new msg must never match `/open lead/i` (index.html L3070) — "follow-up(s) due — see Follow-ups" doesn't; regression-checked in V8 below. This constraint is written into the code comment so future copy edits keep it.
12. **Freshness after acting**: marking a followup Done in QMS saves the blob from the iframe → 'storage' event in the shell (bridge L807, the L708-710 comment documents this path) → debounced `safeCycle` ≤4s → count drops; also the 60s tick.

## Verify (browser harness, shell context; snapshot/restore `retail_queue_management_v1` around the run — remember the UTF-8 rule: never round-trip shell files through PowerShell Get/Set-Content)

All bridge/hub checks run in the SHELL window (the bridge lives there); only V7 needs `moduleFrame.contentWindow.eval` (QMS `state` is block-scoped `let` — visible to iframe-global eval, not on `window`).

**V1 — count + copy + shape.** In the shell console:
```js
(function(){
  var K='retail_queue_management_v1', bak=localStorage.getItem(K); window.__quBak=bak;
  var q=bak?JSON.parse(bak):{customers:[]};
  function iso(o){var t=new Date(Date.now()+o*864e5),p=function(n){return(n<10?'0':'')+n;};return t.getFullYear()+'-'+p(t.getMonth()+1)+'-'+p(t.getDate());}
  q.followups=[
    {id:'t1',status:'Pending',dueDate:iso(0)},{id:'t2',status:'Pending',dueDate:iso(0)},   // 2 due today
    {id:'o1',status:'Pending',dueDate:iso(-1)},                                            // 1 overdue
    {id:'f1',status:'Pending',dueDate:iso(1)},                                             // future — out
    {id:'d1',status:'Done',dueDate:iso(0)},{id:'c1',status:'Converted',dueDate:iso(-2)},   // closed — out
    {id:'m1',status:'Pending'},{id:'m2',status:'Pending',dueDate:''},
    {id:'m3',status:'Pending',dueDate:'31/12/2025'},{id:'m4',status:'Pending',dueDate:42},null // malformed — out
  ];
  localStorage.setItem(K,JSON.stringify(q)); SaagarBridge.runNow();
  var it=SaagarBridge.exceptions().items.filter(function(x){return /follow-up/.test(x.msg||'');});
  console.log((it.length===1 && it[0].area==='QMS' && it[0].sev==='med'
    && it[0].msg==='3 follow-up(s) due (1 overdue) — see Follow-ups')?'V1 PASS':'V1 FAIL', it);
})();
```
**V2 — no stacking across rebuilds:** `SaagarBridge.runNow();SaagarBridge.runNow();` then assert the filtered length is STILL 1.
**V3 — no-overdue copy:** remove `o1` from the seeded array (leave the two today rows), re-run → msg exactly `'2 follow-up(s) due — see Follow-ups'`.
**V4 — QMS key absent:** `localStorage.removeItem(K); SaagarBridge.runNow();` → 0 follow-up items AND `SaagarBridge.exceptions().items` still contains the other checks (function didn't throw mid-build — e.g. the Stock "not locked" items still present).
**V5 — legacy blob:** `localStorage.setItem(K,'{"customers":[]}'); SaagarBridge.runNow();` → 0 follow-up items, no console error.
**V6 — zero due:** all followups future/Done → NO item (assert filtered length 0, never a "0 follow-up(s)" string).
**V7 — parity with the QMS badge:** restore the V1 blob, open the QMS module, then in the shell:
```js
var n=+document.getElementById('moduleFrame').contentWindow.eval(
  "state.followups.filter(f=>f.status==='Pending'&&f.dueDate<=todayISO()).length");
var m=+(SaagarBridge.exceptions().items.filter(x=>/follow-up/.test(x.msg))[0]||{msg:'0'}).msg.match(/^\d+/)[0];
console.log(n===m?'V7 PASS':'V7 FAIL', n, m);
```
Also eyeball `navBadgeFu` in the QMS sidebar = the same number.
**V8 — Home render + routing + EOD non-collision:** with V1 data, trigger `renderHome()`; assert `$('attentionList').innerHTML.includes('QMS: 3 follow-up(s) due')` and the row's button onclick is `navigateToModule('qms')` (cta 'Fix'); then `var s=buildCloseDaySteps().steps.find(x=>x.id==='qms'); console.log(/open lead/i.test('follow-up(s) due')===false && (s.sub==='all leads closed'||/open lead/i.test(s.sub))?'V8 PASS':'V8 FAIL', s);` — the wizard's QMS step must reflect ONLY open leads, never follow-ups.
**V9 — live decay:** flip `t1` to `status:'Done'` in the stored blob, `SaagarBridge.runNow()` → msg becomes `'2 follow-up(s) due (1 overdue) — see Follow-ups'`.
**V10 — restore:** `localStorage.setItem(K, window.__quBak)` (or removeItem if it was absent), `SaagarBridge.runNow()`.

## Risk & blast radius

- **Blast radius: one try-block in one plain file.** No module blob is written (QMS read-only via the already-parsed `q`); the only key written is `saagar_exceptions`, which this function already owns and rebuilds wholesale. No embed/module_tool step; no APK-blob churn.
- **Failure containment:** the whole QMS section sits in its existing `try{...}catch(e){}` — a corrupt blob degrades to "item absent", the house failure mode for every check in this function; the rest of the hub still builds (verified V4/V5).
- **Downstream consumers audited (all of them):** renderHome L3252 (intended new row), renderSync L2848 (display-only banner), buildCloseDaySteps L3067-3072 (unaffected — `/open lead/i` filter, constraint documented in-code + V8), `SaagarBridge.status().exceptions` count L756 (+1, display-only). No module reads `saagar_exceptions` (grep across `_extracted_modules/*.html`, demo-seed.js, whatsapp-share.js, saagar-report.js: zero hits).
- **Perf:** one O(n) counter pass over `followups[]` per cycle (60s tick / debounced storage event); no extra JSON.parse (reuses `q`); blob grows ~100 bytes when the item is present. Idle-cycle write behaviour unchanged (this function already writes EXC every cycle — pre-existing, not worsened).
- **Worst realistic bug:** a miscount displayed on Home/Sync — self-corrects next cycle after data changes; nothing is gated, locked, or written based on it.
- **Rollback:** delete the inserted block; the next cycle's wholesale `S(EXC,...)` purges any lingering item.