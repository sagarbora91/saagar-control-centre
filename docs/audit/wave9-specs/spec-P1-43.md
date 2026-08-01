# P1-43

SUMMARY: Adds a read-only, derived cash cross-check to buildExceptions() in integration-bridge.js: for each CLOSED cash-statement day in the last 3 days, sum QMS cash-mode purchase closures and compare against the Expense ledger's cash income for that day; when QMS cash exceeds statement cash income by more than ₹1, push one med-severity 'Cash' item into the existing saagar_exceptions feed. One-sided by design (ledger cash income legitimately exceeds QMS via service/udhaar/misc income), whole-business by design (QMS carries no per-customer store), skipped entirely on days with any 'Mixed'-mode purchase (cash portion unknowable), and the copy deliberately avoids the substring 'mismatch' so the shell's EOD wizard regex at www/index.html L3084 never blocks the 'Close cash sheet' step. Zero new fields, zero new keys, writes only saagar_exceptions.

NEW FIELDS: []

NEW KEYS: []

BRIDGE CONTRACT: none — bridge-only item (no module-file counterpart edit). For completeness, the bridge READS (read-only, never writes back): retail_queue_management_v1 → customers[].outcome ('Purchase'), .paymentMode ('Cash'|'Card'|'UPI'|'Mixed'), .purchaseAmount (fallback .amount), .exitTime||.entryTime||.walkInTime (day axis); gm_expenses → rows .date/.type==='income'/.mode==='Cash'/.amount/.void; tanishq_statements → [date].closed. It WRITES only the saagar_exceptions blob, appending items in the EXISTING shape {sev:'med',area:'Cash',msg:string,at:'YYYY-MM-DD'}.

# P1-43 — Cash cross-check exception (QMS cash sales vs Expense cash statement)

Effort M / MED RISK (money copy must be right). Read-only variance line in the Exceptions Hub; consumes the meaning of `CASH_CLOSED` (which today is emitted and consumed by nobody).

## Target

| File | Function | Lines (current) | Change |
|---|---|---|---|
| `saagar-control-centre/www/integration-bridge.js` | `buildExceptions(bus)` | L524–571; **insert one self-contained try/catch block after L548** (i.e. after the existing "Cash statement today not closed / mismatch" block at L544–548, before the "Missing vouchers" block at L549–554) | ONLY edit in this item. ~30 lines. |

Read-only inputs (all already used elsewhere in this same file — cite for the implementer):
- `EXP_STMT='tanishq_statements'` (L39), `EXP_LEDGER='gm_expenses'` (L41), `QMS='retail_queue_management_v1'` (L31), `EXC='saagar_exceptions'` (L41).
- `CASH_CLOSED` producer: L170–173 — emits per day where `tanishq_statements[dk].closed===true`. **We do NOT `consume()` it** (see Approach step 0).
- Existing exception item shape (must match exactly): `{sev:'high'|'med'|'low', area:string, msg:string, at:'YYYY-MM-DD'}` — see L527/533/538/546/547/553. Blob written at L569: `S(EXC,{date:d,items:ex,generatedAt:…})`.

Reference reads that ground the design (NOT edited):
- `_extracted_modules/qms.html`: `STORE_KEY='retail_queue_management_v1'` (L387). `renderOutcomeFields()` (L564) — Purchase close captures `#purchaseAmount` + `#paymentMode` select with options **Cash / Card / UPI / Mixed**. `confirmCloseLead()` (L565) — writes `Object.assign(c,{billNo, purchaseAmount:amt, purchaseCategory, paymentMode})`, then `c.outcome='Purchase'` (capitalised), `c.closedAt=ISO`, `c.status='Closed'`, and **backfills `c.exitTime`=now if missing**. Wave-7 recovered-₹ (P1-1) lives on `state.followups[].recoveredValue` (L568–571) with **no payment mode** → excluded (edge 8). QMS is single-store: `DEFAULT_SETTINGS.storeName` (L423) is a settings string; **customers carry NO store field**.
- `_extracted_modules/expense.html`: `K.stmt='tanishq_statements'`, `K.exp='gm_expenses'` (L381). `todayStr()` (L397) — **local** dates key the statement. `migrateStmt()` (L528–541): day record `{date, openingBalance, physDeno, bankDeno, closed, …, mismatchReason, byStore?:{}, monthLocked}` — Wave-5 per-store is a **soft `byStore` overlay**; the top-level `closed` is the business-level close and is the ONLY thing `CASH_CLOSED` keys off. "Cash income" is NOT stored on the statement — it is derived from the ledger: `computeDay()` (L551–570) counts `type==='income' && mode==='Cash'` non-void rows dated that day (`cashIn`, L554–559). The module's own manual Sync tab builds QMS income items at **L1344** with `date:((c.exitTime||c.entryTime||c.walkInTime||todayStr())).slice(0,10)` and `mode:(c.paymentMode||'Cash')` — this fixes our day-axis choice (below).
- `saagar-control-centre/www/index.html`: `EXC_AREA_TO_MODULE` (L3013) — `'Cash'→'expense'`, so area `'Cash'` gets a working "Fix" button. Attention-list renderer L3252–3266 uses only `x.sev/x.area/x.msg` (msg is `escapeHtml`'d). **`buildCloseDaySteps()` L3058–3089: L3084 filters Cash-area items with `/mismatch/i` and blocks EOD step 4 while any match exists** — load-bearing copy constraint (edge 14).

## Additive-safe — TRUE

- Writes ONLY `saagar_exceptions`, a derived blob rebuilt from scratch every cycle (L526 `ex=[]` … L569 `S(EXC,…)`). No module blob is touched; no key is renamed/reshaped; the new item uses the existing item shape with the existing area `'Cash'`.
- Zero new persisted fields anywhere; zero new localStorage keys. Removing the block later leaves no residue (next cycle rebuilds the feed without the item).
- Complies with the hard rule: bridge exception work writes ONLY `saagar_exceptions`.

## Approach

**Step 0 — design decisions (each verified against current code):**

1. **Derive, don't consume.** `buildExceptions` rebuilds `ex[]` every cycle; `consume()` marks `consumed[who]=true` permanently (L96–106), so consuming `CASH_CLOSED` would make the flag one-shot — it would vanish on the next rebuild. Instead, read `tanishq_statements[day].closed` directly (the exact predicate the `CASH_CLOSED` producer uses at L172, and the same read-only pattern the existing L545 check uses). `CASH_CLOSED` stays on the bus as the audit signal; this item is its first *reader in spirit*.
2. **Whole-business comparison, not per-store.** QMS customers carry no store (single blob, single `settings.storeName`), so a per-store split of X is undefined. Expense's Wave-5 `byStore` is a soft overlay and only the TOP-LEVEL `s.closed` emits `CASH_CLOSED`. Compare business totals: all QMS cash purchases vs all ledger cash income (matching `computeDay(date).cashIn`, which counts every row regardless of `e.store`).
3. **Day axis = `(c.exitTime||c.entryTime||c.walkInTime).slice(0,10)`**, NOT `closedAt`. Expense's own Sync tab files a QMS sale's income under exactly this axis (expense.html L1344). Matching it means that when the cashier uses Sync, both sides of the comparison move together and the variance clears; a `closedAt` axis would permanently misalign against Sync-posted income. Same-day closes are identical anyway (`confirmCloseLead` backfills `exitTime`=now). Also matches the hub's existing QMS open-leads check (bridge L537).
4. **One-sided check: flag ONLY `qmsCash > cashIncome + TOL`.** Ledger cash income legitimately EXCEEDS QMS cash sales every day there is WSC service income (auto-posted by `consumeServiceIncomeToLedger`, L477–502, counter default Cash), udhaar settlements, or misc income — a two-sided check would false-fire constantly. The actionable direction is "QMS says more cash was billed than the closed statement's cash income".
5. **Tolerance `CASH_TOL = 1` (₹1 absolute).** Both sides are user-entered integers in practice; ₹1 absorbs decimal/rounding artefacts without hiding a real gap. Named const at the top of the block so it is a one-character tune later.
6. **Only CLOSED statement days** (`s.closed===true`) — that is what `CASH_CLOSED` means; an open day already gets the existing "Cash statement not closed today" nudge (L546).
7. **Window `CROSS_DAYS = 3`** (today + 2 prior, local dates like `today()`): catches "closed last evening, reviewed next morning" and a weekend gap, caps hub noise at ≤3 items (the shell attention list shows only 6 rows, L3269). Do NOT reuse `cutoffIso()` — it is UTC (L54); statements are keyed by local dates (expense `todayStr()` L397).
8. **Skip the whole day when any purchase that day has `paymentMode==='Mixed'`** — the cash portion of a split payment is unknowable; money copy must never guess (MED-RISK note). Rows with missing/other `paymentMode` are simply excluded from X (conservative: shrinks X, one-sided check fires less).
9. **Severity `med`, area `'Cash'`.** `high` is reserved for the statement's own counted-drawer mismatch (L547); this is an advisory cross-check that can have innocent causes. Area `'Cash'` gives the working Fix→expense button via `EXC_AREA_TO_MODULE` (index.html L3013).

**Step 1 — the code.** Insert after L548 (`} }catch(e){}` of the existing Cash block), before the L549 voucher comment:

```js
      // P1-43: QMS cash sales vs CLOSED cash statement — read-only cross-check (the CASH_CLOSED signal,
      // derived not consumed: exceptions are rebuilt every cycle, consuming would make the flag one-shot).
      // ONE-SIDED by design: ledger cash income legitimately exceeds QMS cash (WSC service income, udhaar,
      // misc income), so only "QMS billed MORE cash than the closed statement shows" is flagged.
      // Whole-business totals (QMS customers carry no store; only the top-level stmt close emits CASH_CLOSED).
      // Day axis = exitTime||entryTime||walkInTime — the SAME axis Expense's Sync tab files QMS income under
      // (expense.html L1344), so a Sync-posted day self-heals. COPY CONSTRAINT: msg must NOT contain the
      // substring "mismatch" — www/index.html buildCloseDaySteps (L3084) regex-blocks EOD step 4 on it.
      try{
        var CROSS_DAYS=3, CASH_TOL=1;                       // today + 2 prior LOCAL days; ₹1 rounding tolerance
        var stq=L(EXP_STMT,null), ledq=L(EXP_LEDGER,null), qq=L(QMS,null);
        if(stq&&typeof stq==='object' && Array.isArray(ledq) && qq&&Array.isArray(qq.customers)){
          for(var ci=0;ci<CROSS_DAYS;ci++){
            var cdD=new Date(); cdD.setDate(cdD.getDate()-ci);
            var cd=cdD.getFullYear()+'-'+('0'+(cdD.getMonth()+1)).slice(-2)+'-'+('0'+cdD.getDate()).slice(-2);
            var sD=stq[cd]; if(!sD||!sD.closed) continue;   // only CLOSED days — that is what CASH_CLOSED means
            var qCash=0, qMixed=0;
            qq.customers.forEach(function(c){
              if(!c||String(c.outcome||'').toLowerCase()!=='purchase') return;   // same predicate as produce() L134
              var qd=String(c.exitTime||c.entryTime||c.walkInTime||'').slice(0,10);
              if(qd!==cd) return;
              if(c.paymentMode==='Mixed'){ qMixed++; return; }
              if(c.paymentMode!=='Cash') return;            // Card/UPI/missing-mode rows never count as cash
              qCash+=Number(c.purchaseAmount||c.amount)||0; // same amount fallback as produce() L135
            });
            if(qMixed||!(qCash>0)) continue;                // split payment on the day → unknowable; zero-cash day → nothing to check
            var cIn=0;
            ledq.forEach(function(x){ if(x&&!x.void&&x.date===cd&&x.type==='income'&&x.mode==='Cash') cIn+=Number(x.amount)||0; });   // == computeDay(cd).cashIn
            if(qCash>cIn+CASH_TOL){
              var _inr=function(n){return '₹'+Math.round(n).toLocaleString('en-IN');};
              ex.push({sev:'med',area:'Cash',
                msg:'QMS cash sales '+_inr(qCash)+' vs statement cash income '+_inr(cIn)+(cd===d?'':' ('+cd+')')+" — figures don't tally; verify billing / statement entries",
                at:cd});
            }
          }
        }
      }catch(e){}
```

Implementation notes:
- Variable names `stq/ledq/qq/sD/cd/cdD/qCash/qMixed/cIn/ci/CROSS_DAYS/CASH_TOL/_inr` are chosen to avoid the function-scoped `var` hoists already in `buildExceptions` (`s` at L545, `q` at L536, `led` at L550, `stm` at L545) — do not rename to `s`/`q`/`led`.
- `d` (today, local) is already in scope (L526); the date suffix ` (YYYY-MM-DD)` appears only for the two look-back days.
- The block re-parses `gm_expenses`/`retail_queue_management_v1`; both are already parsed elsewhere in the SAME cycle (QMS at L119 and L536, ledger at L550), so this adds no new order-of-magnitude cost to the 60s tick.
- No `esc()` needed: `msg` contains only bridge-formatted numbers/dates, never user strings (deliberate — never quote a customer name in a money flag), and the shell renderer `escapeHtml`s titles anyway (index.html L3269). Rupees use `toLocaleString('en-IN')` per house style.

**Step 2 — no other edits.** No shell edit (area `'Cash'` already routes via `EXC_AREA_TO_MODULE`), no module edits, no blob re-embeds needed for this item (plain-file bridge only).

## Data model & CARRY analysis

- **New persisted fields: NONE.** The new exception item lives inside the existing `saagar_exceptions` derived blob, same item shape as every existing item (`sev/area/msg/at`), rebuilt every cycle.
- **New localStorage keys: NONE.**
- **stock.html `normaliseImportData()` (~L2238) carry: N/A** — this item adds zero fields to any module blob; nothing to default/carry in the Wave-9 one-pass carry edit.
- Consumed (read-only, never written): `tanishq_statements[date].closed`; `gm_expenses[].{date,type,mode,amount,void}`; `retail_queue_management_v1.customers[].{outcome,paymentMode,purchaseAmount,amount,exitTime,entryTime,walkInTime}`.

## UI (where + exact copy)

No new surface. The item renders through existing consumers of `saagar_exceptions`:
- **Home → attention list** (index.html L3252–3266): orange row (med→orange, ⚠️), title `Cash: <msg>`, CTA **Fix** → opens Expense.
- **Sync tab / SaagarBridge.exceptions()** (bridge L748): raw item visible.

Exact msg (non-accusatory, both sides named, no blame verb):

> `QMS cash sales ₹12,500 vs statement cash income ₹8,000 — figures don't tally; verify billing / statement entries`

and for a look-back day: `…statement cash income ₹8,000 (2026-07-05) — figures don't tally; …`

**Copy constraints (load-bearing):** (a) MUST NOT contain the substring `mismatch` in any casing — `buildCloseDaySteps()` (index.html L3084) regex-matches Cash-area items with `/mismatch/i` and would permanently block EOD step 4 "Close cash sheet" on every flagged (closed!) day; "don't tally" is the deliberate synonym. (b) Keep "QMS cash sales" as the msg prefix — Verify checks key on it and it disambiguates from the two existing Cash msgs ("Cash statement not closed today", "Cash mismatch: …").

## Edge cases

1. `tanishq_statements` absent/malformed (not an object) → guard `stq&&typeof stq==='object'` + block-level try/catch → no item, no crash, other exceptions unaffected.
2. `retail_queue_management_v1` absent or `customers` not an array → skip silently.
3. `gm_expenses` absent or not an array → skip silently (do NOT treat as income ₹0 and flag — an uninstalled Expense module must not accuse anyone).
4. Day with QMS cash sales but statement **not closed** (or day record absent) → NO exception; the existing L546 "not closed today" item is the nudge. This is the `CASH_CLOSED` semantic the item exists to honour.
5. Zero-cash QMS day (`qCash===0`, e.g. all Card/UPI or no purchases) → no item, even if the statement shows cash income (one-sided by design).
6. Any `paymentMode==='Mixed'` purchase on the day → skip the WHOLE day (cash portion of a split payment is unknowable; a money flag must never guess).
7. Ledger cash income EXCEEDS QMS cash sales → no item (legitimate: WSC service income auto-posted by the bridge, udhaar settlements, misc income).
8. Wave-7 recovered-₹ conversions (`followups[].recoveredValue`, qms.html L570) carry no payment mode → excluded from X; if the recovered cash was entered as ledger income it inflates Y only — the safe direction.
9. Legacy/seed purchases with missing `paymentMode` → excluded from X (conservative under-count). Note Expense's Sync tab defaults them to Cash income (L1344) → inflates Y only — safe direction again.
10. Service-close `advance` (qms.html L565) has no mode → excluded from X.
11. Multiple stores, one drawer wrong: comparison is whole-business by design; a per-store `byStore[code].closed` without the top-level close does NOT fire the check (day not "closed"). Documented limitation, matches `CASH_CLOSED`.
12. Void income rows excluded (`x.void`), matching `computeDay()` L553.
13. Statement reopened after close (`closed` back to false) → item disappears next cycle (derived feed).
14. EOD wizard interplay: copy contains no `mismatch` substring → `buildCloseDaySteps` L3084 unaffected; step 1's `/open lead/i` filter is QMS-area only — also unaffected.
15. `purchaseAmount` non-numeric/Infinity → `Number(…)||0` (and QMS's own P1-1 verify-fix already clamps recovered inputs).
16. Cross-day close (visit Monday, closed Wednesday): X files under Monday via the exitTime axis — matching where Sync files the income; if Monday was already closed clean this can surface a Monday item inside the 3-day window. Correct behaviour: cash entered against a closed day SHOULD be looked at; it self-clears when the window slides.
17. Demo seed (`demo-seed.js`): every seeded day has a CLOSED statement + `Counter sales` cash income ₹8k–30k (L246–265), and QMS purchases get `paymentMode=pick(['Cash','Card','UPI','Mixed'])` (L116/135) — days containing a Mixed purchase are skipped; a no-Mixed day whose seeded QMS cash exceeds the seeded counter-sales income will show the flag in the demo APK. Acceptable and illustrative (same precedent as Wave-4 demo-visible exceptions); no seed edit in this item.
18. Bus state irrelevant: the check never touches `bus`/`consume`, so bus pruning/caps (L76–82) cannot make the flag flap.

## Verify (browser harness)

The bridge runs in the SHELL window (plain file, `window.SaagarBridge` exposed at L743) — run these in the TOP window console of the harness copy (never the shipping www/ — and per the harness caution, make the harness copy with byte-exact `Copy-Item`, no PowerShell text round-trip). `moduleFrame.contentWindow.eval` is NOT needed for this item (no module-blob state involved); it remains the tool for the QMS/Expense UI spot-checks in V6.

Helper (paste once):
```js
var T=(function(){var d=new Date();function p(n){return(n<10?'0':'')+n;}return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());})();
function seed(qmsCust,ledRows,stmtDays){ localStorage.setItem('retail_queue_management_v1',JSON.stringify({customers:qmsCust,cros:[],followups:[]}));
  localStorage.setItem('gm_expenses',JSON.stringify(ledRows)); var st={}; (stmtDays||[]).forEach(function(o){st[o.date]=o;});
  localStorage.setItem('tanishq_statements',JSON.stringify(st)); SaagarBridge.runNow();
  return (JSON.parse(localStorage.getItem('saagar_exceptions')).items||[]).filter(function(x){return x.area==='Cash'&&/QMS cash sales/.test(x.msg);}); }
function buyer(amt,mode,day){ return {id:'c'+Math.random(),name:'T',mobile:'9876543210',status:'Closed',outcome:'Purchase',paymentMode:mode,purchaseAmount:amt,billNo:'INV-1',exitTime:day+'T18:00:00.000Z',closedAt:day+'T18:05:00.000Z'}; }
function inc(amt,mode,day,v){ return {id:'e'+Math.random(),type:'income',date:day,amount:amt,mode:mode,void:!!v}; }
```
1. **V1 positive:** `var it=seed([buyer(12500,'Cash',T)],[inc(8000,'Cash',T)],[{date:T,closed:true}]);` → expect exactly 1 item, `sev==='med'`, msg contains `₹12,500` and `₹8,000`, and `!/mismatch/i.test(it[0].msg)`.
2. **V2 not-closed day:** same with `closed:false` → 0 items (and the existing "Cash statement not closed today" med item IS present in the full feed).
3. **V3 one-sided:** income 12,500 (equal) → 0; income 20,000 (excess) → 0.
4. **V4 tolerance boundary:** income 12,499 → 1 item (12500 > 12500); income 12,499.5 → 0 (12500 ≤ 12500.5).
5. **V5 Mixed skip:** add `buyer(3000,'Mixed',T)` to V1's customers → 0 items. **V5b:** Card/UPI buyers alongside the Cash buyer don't change X.
6. **V6 regression sweep:** with V1 seeded, confirm Home attention list shows the orange `Cash: QMS cash sales …` row with a Fix button that opens Expense; open the EOD "Close the day" wizard → step 4 "Close cash sheet" reads **done** (sheet closed, no `/mismatch/i` match).
7. **V7 absent keys:** `localStorage.removeItem('gm_expenses')` then `SaagarBridge.runNow()` → no throw, 0 items; same for the QMS key and the statements key.
8. **V8 window:** seed the variance on `T-1` (closed) only → 1 item whose msg ends with `(T-1) — …` and `at===T-1`; seed it on `T-4` only → 0 items.
9. **V9 void excluded:** V1 plus `inc(10000,'Cash',T,true)` (void) → item still fires with Y=₹8,000.
10. **V10 idempotence/flap:** run `SaagarBridge.runNow()` 3× → still exactly 1 item (feed rebuilt, never appended); fix the ledger (add `inc(4500,'Cash',T)`) → next run, 0 items.

## Risk & blast radius

- **Blast radius:** one ~30-line derived-read block inside `buildExceptions`'s own try/catch chain; a malformed blob can only suppress THIS item, never the others (per-block catch, same as every existing check). Writes only `saagar_exceptions` — no module blob, no bus mutation, no consume-marks. Fully removable with zero residue.
- **Money-copy risk (the MED):** mitigated by (a) one-sided comparison — we never flag the everyday "income exceeds QMS" case; (b) Mixed-day skip — never print a guessed figure; (c) non-accusatory wording naming both sources; (d) the `mismatch`-substring ban keeping the EOD wizard honest (index.html L3084).
- **Noise risk:** shops that never enter counter-sales income into the Expense ledger will see this flag on every closed no-Mixed cash day — that is the feature's teaching intent (the copy tells them exactly which two entries to reconcile); capped at 3 items by the window and med severity keeps it below the fold of high items.
- **Perf:** +1 `JSON.parse` each of QMS/ledger/statements per 60s cycle, both already parsed in the same cycle elsewhere (L119/L536/L550); 3-day loop is O(3·customers + 3·ledger rows). No new writes on idle cycles beyond the existing unconditional `S(EXC,…)` at L569 (unchanged behaviour).
- **Interactions checked:** EOD wizard (safe via copy constraint), attention list (renders med as orange, escaped), `EXC_AREA_TO_MODULE` (Cash→expense already mapped), demo seed (may fire illustratively — accepted, edge 17), Wave-5 per-store drawers (explicitly out of scope — only the top-level close triggers, edge 11).