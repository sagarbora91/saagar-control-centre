# P1-25

SUMMARY: Add a 'CRO audit pending today' evening exception to buildExceptions() in www/integration-bridge.js: after cfg().dsrClosingTime (reused 20:30 gate), count active non-leave employees (mirroring cro_audit's croMasterOptions()+leaveBlockedSet() predicate) with no cro_audits_v3 record dated today, and push ONE {sev:'med', area:'CRO', ...} item; plus a one-line shell mapping 'CRO':'cro_audit' in EXC_AREA_TO_MODULE so the hub's Fix button routes.

NEW FIELDS: []

NEW KEYS: []

CROSS-FILE CONTRACT: READS ONLY (no writes beyond the existing saagar_exceptions rebuild): cro_audits_v3 array items' `date` (YYYY-MM-DD string) and `cro` (name string) — the cro_audit.html owner (P1-23/24) must NOT rename/reshape these two fields; saagar_employee_master_v1 items' {name, active}; saagar_gate_status.unavailable[kk(name)].leave. SHELL EDIT (applied by orchestrator, one line): add `'CRO':'cro_audit'` to EXC_AREA_TO_MODULE at www/index.html L3013.

SHARED REGIONS: [
 "integration-bridge.js buildExceptions() (L561-694) — no Wave-11 sibling touches this file (bridge is P1-25 only per wave shape)",
 "www/index.html EXC_AREA_TO_MODULE L3013 — orchestrator-applied shell edit; any other item adding an area must merge into the same object literal"
]

# P1-25 — 'CRO audit pending today' exception (S/low)

## Target
- **File (only code edit):** `www/integration-bridge.js` (canonical repo copy: `V:\Co work\Projects\Retail\saagar-control-centre\www\integration-bridge.js`)
  - `buildExceptions(bus)` — **L561–694**. Insert the new block **after** the Wave-4 DSR-unsubmitted block (ends L690) and **before** `ex.sort(...)` at L691.
  - Reuses existing helpers/consts: `L()` L65, `S()` L66, `nm()` L67, `kk()` L68, `today()` L63, `cfg()` L56–61 (`dsrClosingTime` L60), `EMP_MASTER` L28 (`saagar_employee_master_v1`), `GATE` L29 (`saagar_gate_status`), `EXC` L41.
- **Shell edit (ONE line, applied by orchestrator, spec'd explicitly below):** `www/index.html` **L3013** `EXC_AREA_TO_MODULE` — no existing area routes to `cro_audit` (current map: Floor gate→grooming, QMS→qms, Stock→stock, Cash→expense, Expense→expense, Tax→tax, Service→service). 'Grooming'/'DSR' areas would be semantically dishonest and 'Grooming' is also unmapped anyway; so add a new area `'CRO'`.
- **Read-only external data:** `cro_audits_v3` (written by cro_audit.html `submitAudit()` ~L1433; records `{id,date:'YYYY-MM-DD',store,cro,sm,total,grade,tasks,submittedAt,...}`; reader `getAudits()` L1460), `saagar_employee_master_v1`, `saagar_gate_status.unavailable`.

## Additive-safe — TRUE
- Writes **only** `saagar_exceptions`, which `buildExceptions` already rebuilds wholesale every cycle (`S(EXC,{date:d,items:ex,...})` L692). No new localStorage keys, no new fields on any record, no module blob touched, no normaliser anywhere needs to carry anything (the exceptions blob is derived and regenerated each tick — nothing persists to be dropped).
- Item shape matches the binding contract exactly: `{sev:'med', area:'CRO', msg:'...', at:d}`.
- EOD safety (Wave-9 lessons): `buildCloseDaySteps` (index.html L3058–3092) consumes ONLY areas `QMS` (/open lead/i, L3070), `Stock` (/closing not locked/i, L3082), `Cash` (/mismatch/i, L3087). Area `'CRO'` is consumed by **no** step → cannot wedge the wizard. Copy contains neither "open lead", "closing not locked", nor "mismatch" anyway.

## Approach
1. **Active-CRO predicate — mirror the module.** cro_audit.html defines who is auditable via `croMasterOptions()` (L2027–2033: employee master entries with `e && e.name && e.active!==false`) minus `leaveBlockedSet()` (L2016–2021: `gate.unavailable[k].leave===true`). The bridge already mirrors this exact pair for the grooming item (L567–569). Mirror it again. (The module has no role/dept filter — every active, non-leave master employee is an eligible CRO; do NOT invent one.)
2. **'Submitted today' = an audit record with `a.date===d`** (the audit's business date, set by the form's date field), NOT `submittedAt` — a back-dated audit for today counts, yesterday's audit submitted this morning does not. Match CRO by `kk(a.cro)` — same case/space-insensitive key `findDupAudit()` (cro_audit.html L1464–1468) uses. Any store counts (the discipline is one audit per CRO per day).
3. **Evening gate — REUSE `cfg().dsrClosingTime`** (default '20:30', SM-configurable). Justification: the CRO audit is the same end-of-day discipline as DSR submission; before store close a missing audit is not yet a fault, and a second config knob for the same evening boundary would drift. Same string-compare idiom as L682–684.
4. **Idempotence/dedup:** none needed — `ex[]` is rebuilt from scratch and `S(EXC,...)` overwrites wholesale every tick (same argument as the P1-40 comment, L580–584). ONE aggregate item, self-clears when audits land or the day rolls.
5. **Degradation:** own `try/catch` (house pattern); any malformed blob (non-array audits, non-array master, non-object gate) → item absent. Skip when zero active CROs (`elig===0`).

### Code sketch (insert after L690, before `ex.sort` L691)
```js
      // P1-25: CRO daily audit(s) not submitted after store close (cfg.dsrClosingTime — the SAME
      // evening boundary as the unsubmitted-DSR alert; the audit is the same EOD discipline).
      // Eligible = cro_audit's own predicate: croMasterOptions() (master, active!==false) minus
      // leaveBlockedSet() (gate.unavailable[k].leave===true) — hub count === module datalist.
      // 'Submitted today' = a cro_audits_v3 record with a.date===d (business date, any store),
      // CRO matched by kk() like the module's findDupAudit. ONE aggregate item; ex[] is rebuilt
      // wholesale each cycle (S(EXC,...) below) so no dedup state exists. area 'CRO' is consumed
      // by NO buildCloseDaySteps filter (safe); routes via EXC_AREA_TO_MODULE['CRO']='cro_audit'.
      try{
        var __ct=cfg().dsrClosingTime;
        var __cn=(function(){var t=new Date();return String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0');})();
        if(__cn>=__ct){
          var __cem=L(EMP_MASTER,[])||[], __cg=L(GATE,{})||{}, __cun=(__cg&&__cg.unavailable)||{};
          var __cau=L('cro_audits_v3',[]), __caDone={};
          if(Array.isArray(__cau)) __cau.forEach(function(a){ if(a&&a.date===d&&a.cro) __caDone[kk(a.cro)]=1; });
          var __cp=[], __celig=0;
          if(Array.isArray(__cem)) __cem.forEach(function(e){
            if(!e||!e.name||e.active===false) return;
            var k=kk(e.name); if(__cun[k]&&__cun[k].leave===true) return;
            __celig++; if(!__caDone[k]) __cp.push(nm(e.name));
          });
          if(__celig>0 && __cp.length)
            ex.push({sev:'med',area:'CRO',
              msg:__cp.length+' CRO audit(s) pending today — '+__cp.slice(0,3).join(', ')+(__cp.length>3?' +'+(__cp.length-3)+' more':'')+' (after '+__ct+')',
              at:d});
        }
      }catch(e){}
```

### Shell edit (orchestrator applies; ONE line, index.html L3013)
```js
const EXC_AREA_TO_MODULE = { 'Floor gate':'grooming', 'QMS':'qms', 'Stock':'stock', 'Cash':'expense', 'Expense':'expense', 'Tax':'tax', 'Service':'service', 'CRO':'cro_audit' };
```
`'cro_audit'` is the registry module id (ACCESS_MODULES L2019; `navigateToModule('cro_audit')` already used at L3909-idiom). With the mapping, the Home attention card renders the Fix button (L3263–3266); without it the item still shows with a generic Sync CTA — so the bridge change is safe even if the shell edit lags.

## Data model & CARRY analysis
- **New localStorage keys: NONE.** New item rides the existing `saagar_exceptions` blob (justified: that key IS the Exceptions-Hub contract; the item is derived, rebuilt every tick, never migrated).
- **New fields: NONE.** Reads only existing fields: `cro_audits_v3[i].date`/`.cro`; `saagar_employee_master_v1[i].name`/`.active`; `saagar_gate_status.unavailable[k].leave`; `saagar_bridge_config.dsrClosingTime`.
- **Normaliser carry:** n/a — no module normaliser reads `saagar_exceptions`; the shell consumers (`renderHome` L3263, `buildCloseDaySteps` L3063) tolerate unknown areas by design (generic Sync CTA / area filter miss).
- **Coordination note for the cro_audit.html owner (P1-23/24):** this item depends on `a.date` and `a.cro` staying as-is (additive rules guarantee this; stated for completeness).

## UI (all existing surfaces, no new markup)
- Home attention card title: `CRO: 2 CRO audit(s) pending today — Ramesh, Priya (after 20:30)` with amber dot (sev med), sub-line 'Cross-module flag — opens the module that fixes it.', **Fix** button → `navigateToModule('cro_audit')`.
- Also appears in Config → Sync exceptions list (existing rendering of `saagar_exceptions`).
- Exact msg template: `'<N> CRO audit(s) pending today — <up to 3 names>[ +K more] (after <HH:MM>)'`.

## Edge cases
1. **Before threshold** (`__cn < __ct`): no item — a mid-day rebuild never nags early. String compare on zero-padded HH:MM is correct (same idiom as L682–684).
2. **Zero active CROs** (empty/missing master, or all inactive/on leave): `__celig===0` → skip entirely (per design brief).
3. **All eligible CROs audited:** `__cp.length===0` → no item; self-clears on the next tick (≤60s, TICK L45) after an audit is submitted, and immediately on the EOD wizard's `SaagarBridge.runNow()` (index.html L3122).
4. **Back-dated / cross-store audits:** counted iff `a.date===d` (business date); an audit for today at either store satisfies the CRO's daily requirement; yesterday's audit submitted tonight does NOT.
5. **Malformed blobs:** `cro_audits_v3` non-array → `Array.isArray` guard → everyone pending is still computed from a valid master, BUT if `L()` throws it returns the fallback `[]`; master non-array or gate non-object → guards → item absent. Whole block in its own try/catch → any surprise degrades to item-absent, never breaks the other exception producers.
6. **Name mismatches:** `kk()` (trim+lowercase) on both sides matches the module's own dup-key (`findDupAudit` L1464); a CRO typed as 'ramesh ' in the audit form still clears 'Ramesh' from the master.
7. **Day rollover after midnight:** `d=today()` is the new date; yesterday's audits no longer match; the item re-arms only after that day's `dsrClosingTime` — correct.
8. **`__caDone` collision with a leave CRO's audit:** harmless — done-set is keyed independently of eligibility.
9. **EOD wizard pollution:** impossible — area 'CRO' is consumed by no step filter (only QMS/Stock/Cash are read, L3067–3087); copy avoids 'open lead'/'closing not locked'/'mismatch'.
10. **Prototype-key poisoning** (Wave-10 lesson): `__caDone`/`__cun` are plain objects indexed by `kk(name)`; a CRO literally named '__proto__' would key `Object.prototype` — negligible here (read-only truthiness check, same exposure as the existing grooming block L567–569 which set the house pattern; no fix required, noted for the skeptics).

## Verify
The bridge runs in the SHELL window (not an iframe) — drive it via the harness page's top window, not `moduleFrame`. (For any cro_audit-module poking, that blob's tab-switcher is **`go('audit'|'dashboard'|'history')`** — cro_audit.html L521–523.)
1. Seed: `localStorage.setItem('saagar_employee_master_v1', JSON.stringify([{name:'Ramesh',active:true},{name:'Priya',active:true},{name:'Old Guy',active:false}]))`; `localStorage.setItem('saagar_gate_status', JSON.stringify({blocked:[],unavailable:{priya:{leave:true}}}))`; `localStorage.removeItem('cro_audits_v3')`; set `saagar_bridge_config` `{dsrClosingTime:'00:01'}` (forces the gate open at any test hour).
2. Run `SaagarBridge.runNow()`; read `JSON.parse(localStorage.getItem('saagar_exceptions'))` → expect exactly one item `{sev:'med',area:'CRO'}` with msg `1 CRO audit(s) pending today — Ramesh (after 00:01)` (Priya on leave excluded, Old Guy inactive excluded).
3. Add `cro_audits_v3` = `[{id:'a1',date:'<today>',store:'WLMHW',cro:'  RAMESH ',sm:'X',total:80}]` → runNow → item GONE (kk match).
4. Set `dsrClosingTime:'23:59'` (future) → runNow → item absent (pre-threshold).
5. Master = `[]` → item absent (zero-eligible skip). `cro_audits_v3` = `'{bad'` (corrupt) → runNow throws nowhere; item present per step 2 state (L() fallback), no console errors.
6. Shell: on Home, the attention card shows the CRO item with a **Fix** button that opens the cro_audit module (confirms the L3013 mapping). Open Close-the-day wizard → still exactly 4 steps, none referencing the CRO item.
7. Regression: with a QMS open lead + unlocked stock seeded, confirm those items still appear and the wizard filters behave unchanged.

## Risk & blast radius
- **Low.** One additive block inside an already-try/catch-per-producer function that rebuilds a derived key wholesale; failure mode is item-absent. No module blob read-modify-write, no bus events, no new keys.
- Blast radius: `saagar_exceptions` consumers (Home attention card, Config→Sync list, EOD wizard) — first two render unknown areas generically; the wizard provably ignores area 'CRO'.
- The one-line shell edit is order-independent from the bridge change (missing mapping degrades to a Sync CTA, never an error).
- Nag-fatigue risk accepted by design: fires only after store close and self-clears on submission.