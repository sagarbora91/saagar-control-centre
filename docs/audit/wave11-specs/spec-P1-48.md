# P1-48

SUMMARY: At payroll lock, sum the freshly-frozen snapshot into a new optional run.statTotals field ({emp,pt,pfEE,pfER,esEE,esER,net}, the exact shape statutorySummary's opts.totals needs) inside state.runs[key] under localStorage 'payroll_suite_v1_2026'; unlock's run-object rebuild drops it automatically (no stale totals), relock recomputes. Defines the read contract (key format 'MonthName-Year', locked-only) so P1-26/27's saagar-report.js owner can build the Month-end pack's statutory sheet from stored totals when live opts are absent.

NEW FIELDS: [
 {
  "field": "statTotals",
  "where": "state.runs[<MonthName-Year>] run object, localStorage key 'payroll_suite_v1_2026' (payroll.html)",
  "type": "object {emp:int, pt:number, pfEE:number, pfER:number, esEE:number, esER:number, net:number, at:ISO-string}",
  "default": "absent (undefined) — only written by lockRun(); absence means 'not locked / pre-Wave-11 lock'",
  "carried_in": "No carry code needed: normalizeState() L1594 passes s.runs through untouched (only type-checks it is an object); normalizeRow/normalizeAdvance never touch runs. MUST NOT add per-run reshaping. unlockRun() L3060 rebuilds the run object without statTotals — intentional (stale-clear), document, do not 'fix'."
 }
]

NEW KEYS: []

CROSS-FILE CONTRACT: READ CONTRACT for P1-26/27 owner (saagar-report.js): stored = JSON.parse(localStorage.getItem('payroll_suite_v1_2026')||'{}'); run = stored.runs && stored.runs[key] where key = MONTHS[mm-1] + '-' + yyyy converted from the pack's 'YYYY-MM' month string (MONTHS = full English month names, e.g. '2026-07' → 'July-2026'; matches payroll pkey() L1687). Use run.statTotals ONLY if run.status==='locked' && run.statTotals is an object. Then call builder statutorySummary with opts = { period: key.replace('-',' '), totals: run.statTotals, preparedBy: run.preparedBy||'', approvedBy: run.approvedBy||'Authorised Signatory' } — statTotals field names (emp,pt,pfEE,pfER,esEE,esER,net) are exactly the o.totals names statutorySummary already reads at saagar-report.js L470. If null → keep existing 'Open the Payroll module…' empty-state (L469). Adding 'statutorySummary' to _packTypes.monthly (L1394) belongs to P1-26/27, not this item.

SHARED REGIONS: [
 "payroll.html lockRun() L3032-3054 (P1-26/27 payroll-side work, if any, may also touch the Approval tab; coordinate)",
 "saagar-report.js statutorySummary L464-494 and _packTypes/pack L1394-1418 (read-side owned by P1-26/27 — this spec defines the contract only)"
]

# P1-48 — Payroll: persist statutory totals at pay-run lock

## Target
- **Writer (this item's only edit):** `V:/Co work/Projects/Retail/_extracted_modules/payroll.html`
  - `lockRun()` L3032–3054 (insert statTotals computation after the snapshot build at L3043, add field to the run object literal L3045–3051)
  - `unlockRun()` L3055–3062 (NO edit — behaviour documented)
  - Context functions: `payTotals()` L2861–2867, `calcGM()` L1772, `pkey()` L1687 / `curKey()` L1688, `normalizeState()` L1576–1596 (runs pass-through at L1594), `STORAGE_KEY="payroll_suite_v1_2026"` L1367, `getRun()` L1691, `openEngineReport()` L1465–1486 (live-totals reference shape L1472–1474).
- **Reader (contract only — edit belongs to P1-26/27's owner):** `www/saagar-report.js` — `statutorySummary` builder L464–494 (reads `o.totals`: `pfEE,pfER,esEE,esER,pt,net,emp` at L470), `_packTypes` L1394, `pack()` L1395–1418 (calls `this.build(t,{date,month})` with month `'YYYY-MM'` from `#rptMonth`).
- **Gotcha:** payroll.html has a `type="application/json"` seed block (`#app-data`, see `defaultState()` L1561) — syntax-check only real script blocks.

## Additive-safe: TRUE
- One new OPTIONAL field `statTotals` on the per-month run object inside the existing `payroll_suite_v1_2026` blob. No key renamed/reshaped; no new localStorage key.
- Normaliser carry: `normalizeState()` L1594 does `s.runs=(s.runs&&typeof s.runs==="object")?s.runs:{}` — runs objects are passed through byte-for-byte, so `statTotals` survives every load/import/normalize with **zero carry code**. Do NOT add per-run normalisation (the month-viewer comment L2895 promises runs are never migrated).
- Old data simply lacks the field → reader falls back to the existing empty-state note. Older app versions ignore the extra field.

## Approach
1. In `lockRun()`, immediately after the snapshot loop (L3043 `activeGmRows().forEach(row=>{ snapshot[empKeyOf(row)]=calcGM(row); });`), sum the **snapshot itself** (not a second live `payTotals()` pass) so the stored totals are provably the frozen figures:

```js
  // P1-48: persist statutory totals with the frozen run so the Month-end pack can
  // build the PF/ESIC/PT remittance sheet without the module being open.
  // Summed from the snapshot just built (calcGM outputs), so they exactly match the lock.
  const statTotals={emp:0,pt:0,pfEE:0,pfER:0,esEE:0,esER:0,net:0,at:new Date().toISOString()};
  Object.keys(snapshot).forEach(kk=>{const c=snapshot[kk];
    statTotals.emp++; statTotals.pt+=safeN(c.pt); statTotals.pfEE+=safeN(c.pfEE);
    statTotals.pfER+=safeN(c.pfEmpr); statTotals.esEE+=safeN(c.esicEE);
    statTotals.esER+=safeN(c.esicEmpr); statTotals.net+=safeN(c.finalPay);});
```
   Field mapping is the SAME one the live report path already uses (`openEngineReport` L1472–1474 and `payTotals` L2863–2865): `pfER←c.pfEmpr`, `esEE←c.esicEE`, `esER←c.esicEmpr`, `net←c.finalPay`. Store raw (unrounded) sums — `statutorySummary` applies `inr()` rounding, same as the live path.
2. Add the field to the run object literal (L3045–3051):
```js
  state.runs[k]={status:"locked",
    ...,
    snapshot, advRecovered, statTotals};
```
3. `queueSave()` at L3052 already persists it. No other payroll change.
4. **Unlock/relock:** `unlockRun()` L3060 rebuilds the run as `{status:"approved",preparedBy,checkedBy,approvedBy}` — `statTotals` is dropped along with `snapshot`, exactly the stale-prevention we want. Every subsequent `lockRun()` builds a fresh object → totals are recomputed on EVERY lock. Add a one-line comment in `unlockRun()`: `// statTotals intentionally dropped with the snapshot — a stale statutory sheet must never outlive an unlock (P1-48).` No functional edit.

### Reader contract (P1-26/27 owner implements in saagar-report.js — spec'd here so shapes agree)
```js
// inside SaagarReport, helper for the pack path:
_payrollLockedTotals: function (ym) {           // ym = 'YYYY-MM' from pack()
  try {
    var MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
    var p=String(ym||'').split('-'); if(p.length<2) return null;
    var key=MONTHS[Number(p[1])-1]+'-'+Number(p[0]);      // 'July-2026' — payroll pkey() format
    var st=JSON.parse(localStorage.getItem('payroll_suite_v1_2026')||'{}');
    var run=st.runs&&st.runs[key];
    if(run&&run.status==='locked'&&run.statTotals&&typeof run.statTotals==='object')
      return {totals:run.statTotals, preparedBy:run.preparedBy||'', approvedBy:run.approvedBy||'', period:key.replace('-',' ')};
  } catch(e){}
  return null;
},
```
The pack/build path for `statutorySummary` (once P1-26/27 adds it to `_packTypes.monthly`) passes `opts.totals` from this helper when live totals are absent; the builder itself (L464) needs no change to consume it since `statTotals` uses the exact `o.totals` field names. When the helper returns null the existing L469 empty-note stands. Note: `emp` count in `statTotals` counts snapshot KEYS — `runBlockingErrors()` (L2877–2890) already blocks locking with duplicate/blank `empKeyOf`, so key-count === employee-count for every run locked after that audit fix.

## Data model & CARRY analysis
- `statTotals` — object `{emp:int, pt, pfEE, pfER, esEE, esER, net:number(raw), at:ISO string}`; default ABSENT; lives on `state.runs['<MonthName>-<Year>']` in `payroll_suite_v1_2026`. Carry: none needed — `normalizeState()` L1594 passes `s.runs` through untouched (verified; also survives JSON import at L2287 which routes through the same normaliser). `mirrorRowOutputs()` untouched.
- New localStorage keys: NONE.

## UI
- None visible in payroll (lock toast unchanged). Optional (recommended, 1 line): extend the L3053 toast to `"Pay-run LOCKED for "+cm+" "+cy+". Figures are now frozen. Statutory totals saved for the Month-end pack."`
- Reader-side copy (P1-26/27's file): unchanged builder copy; the L491 note already says totals are "from the payroll sheet".

## Edge cases
1. **Lock with 0 active GM employees** — `runBlockingErrors()` doesn't block an empty run; `statTotals` all zeros with `emp:0`. Reader still renders (zero remittance sheet is honest). Acceptable; do not special-case.
2. **Unlock then edit then relock** — old `statTotals` destroyed at unlock (L3060 rebuild), recomputed at relock. Never stale while locked.
3. **Month never locked / pre-Wave-11 lock** — `statTotals` absent → reader helper returns null → existing "Open the Payroll module…" empty-state. Pre-Wave-11 LOCKED months stay on the empty-state until the user unlocks+relocks; do not backfill from snapshot in the reader (snapshot exists, but keep the reader dumb — one write path).
4. **`closeMonth()`** (L3063) — only flips meta to the next month; the locked run object (with `statTotals`) is untouched. Correct.
5. **ST_READ_ONLY / stGuardWrite** — `lockRun()` bails at L3033 before any write; no read-only leak.
6. **Corrupt blob** — reader helper is fully try/caught → null → empty-state, never throws into the pack loop (pack's `.catch(function(){next();})` L1415 also shields).
7. **Rounding** — store raw sums; `inr()` in the builder rounds for display, identical to today's live path, so live-vs-pack PDFs match to the rupee.
8. **Month-key locale** — `pkey()` uses the module's English `MONTHS` names; reader must use the same hardcoded English array (never `toLocaleString`).

## Verify (browser harness, `moduleFrame.contentWindow.eval`; payroll tab switcher = `switchTab`, e.g. `switchTab('approval')`)
1. Seed 2+ GM employees with unique empIds, `switchTab('approval')`, set Approved By, stub `confirm=()=>true`, call `lockRun()`.
2. `JSON.parse(localStorage.getItem('payroll_suite_v1_2026')).runs[curKey()].statTotals` — assert object with all 7 numeric fields + `at`; assert `pfER>0` when a Structured-salary row exists and `emp === Object.keys(run.snapshot).length`.
3. Cross-check: eval `payTotals().T` and assert `statTotals.pfEE===T.pfEE`, `pfER===T.pfER`, `esEE===T.esEE`, `esER===T.esER`, `pt===T.pt`, `net===T.net` (snapshot vs live must agree immediately after lock).
4. `unlockRun()` (confirm stubbed) → assert `runs[curKey()].statTotals === undefined`.
5. Relock after changing one employee's gross → assert `statTotals.net` changed (recompute-on-lock).
6. Normaliser survival: reload the module iframe → re-read the run → `statTotals` still present (runs pass-through).
7. Contract dry-run (shell window, no saagar-report edit yet): run the helper snippet from this spec against the harness localStorage for the locked month string 'YYYY-MM' → returns totals; for an unlocked month → null.
8. Regression: `openEngineReport('statutorySummary')` live path still posts identical figures; `closeMonth()` still works; 0 console errors.

## Risk & blast radius
- LOW. Writer is ~10 additive lines inside one function of one blob; the only mutated structure (`state.runs[k]`) is rebuilt wholesale at that exact spot already. No bridge/EOD items, no buildExceptions, no new areas — EXC_AREA_TO_MODULE / buildCloseDaySteps untouched.
- Consumers of run objects (`renderApproval`, month-viewer `archiveKeys` L2898, `gmComputed` L1732) read named fields only — an extra field is invisible to them.
- Failure mode if reader lands without writer (or vice versa): month-end pack keeps today's behaviour (empty-state note) — degraded, never wrong figures.
- Cross-file coupling is data-only (localStorage), so payroll.html and saagar-report.js owners can build in parallel against this contract.