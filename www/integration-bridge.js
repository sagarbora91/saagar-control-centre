/* ═══════════════════════════════════════════════════════════════════════════
   SAAGAR CONTROL CENTRE — CROSS-MODULE INTEGRATION BRIDGE  (event-bus core)
   ───────────────────────────────────────────────────────────────────────────
   v2: refactored from ad-hoc pairwise links into an append-only EVENT BUS.

   PRODUCERS scan each module's localStorage and emit idempotent events
   (deterministic id → never double-emitted). CONSUMERS process unconsumed
   events idempotently and mark themselves done. The bus (saagar_bus) is the
   single audit trail of every cross-module flow — and the same model the
   eventual PHP rebuild will use, so this migrates instead of being rebuilt.

   Links carried (all backward-compatible with existing keys):
     • Employee Master union ............ reconcile (single staff list)
     • Grooming + Leave clearance gate ... GROOMING_RESULT / LEAVE_APPROVED
                                           → QMS/DSR block banner + gate-status
     • QMS → DSR auto-fill .............. SALE/SERVICE/NONPURCHASE_CLOSED
     • DSR → Stock roll-up (feed) ....... DSR_SUBMITTED
     • DSR/Leave → Payroll (feed) ....... DSR_SUBMITTED + LEAVE_APPROVED
     • Organisation publish ............. seeds Payroll firm + Tax firms
   Honest boundary: best-effort offline reconciliation; true transactional
   enforcement is the server rebuild. Every write is idempotent, labelled,
   and visible in the bus.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var EMP_MASTER='saagar_employee_master_v1', ORG_MASTER='saagar_org_master_v1';
  var BUS='saagar_bus', LOGK='saagar_bridge_log', GATE='saagar_gate_status';
  var Q2D='saagar_bridge_qms2dsr', ATT='saagar_payroll_attendance_feed';
  var GROOM='saagar_grooming_', QMS='retail_queue_management_v1';
  var DSR='saagar_dsr_', DSR_STAFF='saagar_dsr_staff';
  var LEAVE='leavedesk_v3', STOCK_RE=/^saagar_stock_(WLMHW|HEMW)_(\d{4}-\d{2}-\d{2})$/;
  var PAYROLL='payroll_suite_v1_2026', TAX='taxcal_v2', EXP_STMT='tanishq_statements';
  var CRO_FEED='saagar_cro_audit_feed', WSC='saagar_wsf_v2', TAXPAY='saagar_tax_payable';
  var EXC='saagar_exceptions', EXP_LEDGER='gm_expenses', EXP_TAXFEED='gm_tax_feed';
  var CFG='saagar_bridge_config';
  var MK_BRANDS='saagar_master_brands', MK_VENDORS='saagar_master_vendors', MK_CUSTOMERS='saagar_master_customers';
  var FAIL_PCT=60, TICK=60000, BUS_CAP=2000;
  function cfg(){ var c=L(CFG,null)||{}; return {
    failPct: (typeof c.failPct==='number'&&c.failPct>=0&&c.failPct<=100)?c.failPct:60,
    leaveGates: c.leaveGates!==false,
    voucherThreshold: (typeof c.voucherThreshold==='number'&&c.voucherThreshold>=0)?c.voucherThreshold:2000
  }; }

  function today(){var d=new Date();function p(n){return(n<10?'0':'')+n;}return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
  function ym(s){return(s||today()).slice(0,7);}
  function L(k,fb){try{var v=localStorage.getItem(k);return v?JSON.parse(v):fb;}catch(e){return fb;}}
  function S(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(e){return false;}}
  function nm(n){return String(n||'').trim();}
  function kk(n){return nm(n).toLowerCase();}
  function blog(m){try{var a=L(LOGK,[]);a.unshift({at:new Date().toISOString(),m:m});if(a.length>250)a=a.slice(0,250);S(LOGK,a);}catch(e){}}

  /* ── EVENT BUS ─────────────────────────────────────────────────────── */
  function busLoad(){var b=L(BUS,null);return Array.isArray(b)?b:[];}
  function busSave(b){if(b.length>BUS_CAP)b=b.slice(b.length-BUS_CAP);S(BUS,b);}
  function emit(bus,type,idSuffix,payload,src){
    var id=type+':'+idSuffix;
    for(var i=bus.length-1;i>=0 && i>bus.length-400;i--){ if(bus[i].id===id) return false; }
    if(bus.some(function(e){return e.id===id;})) return false;
    bus.push({id:id,type:type,at:new Date().toISOString(),src:src||'',payload:payload||{},consumed:{}});
    return true;
  }
  function consume(bus,type,who,fn){
    var n=0;
    bus.forEach(function(e){
      if(e.type!==type) return;
      e.consumed=e.consumed||{};
      if(e.consumed[who]) return;
      try{ if(fn(e)!==false){ e.consumed[who]=true; n++; } }catch(err){}
    });
    return n;
  }

  /* ── PRODUCERS ─────────────────────────────────────────────────────── */
  function produce(bus){
    var emitted=0,d=today();
    // grooming today → GROOMING_RESULT
    try{ (L(GROOM+d,[])||[]).forEach(function(r){
      if(r&&r.name) emitted+=emit(bus,'GROOMING_RESULT',d+':'+kk(r.name),{name:nm(r.name),pct:Number(r.pct)||0,date:d},'grooming')?1:0;
    }); }catch(e){}
    // QMS closed leads → SALE/SERVICE/NONPURCHASE_CLOSED
    try{ var q=L(QMS,null);
      if(q&&Array.isArray(q.customers)){
        var cros={}; (q.cros||[]).forEach(function(c){if(c)cros[c.id]=c.name;});
        q.customers.forEach(function(c){
          if(!c) return; var out=(c.outcome||'').toLowerCase(); if(!out&&c.status!=='closed') return; if(!out) return;
          var cid=c.id||c.mobile; if(!cid) return;
          var t=(c.exitTime||c.walkInTime||'')+''; var dt=t?t.slice(0,10):d;
          var cro=cros[c.allocatedCroId]||cros[c.croId]||c.croName||c.allocatedCroName||'';
          var type= out==='purchase'?'SALE_CLOSED' : out==='service'?'SERVICE_CLOSED' : 'NONPURCHASE_CLOSED';
          emitted+=emit(bus,type,String(cid),{cid:cid,cro:cro,date:dt,amount:Number(c.amount)||0,bill:c.billNo||c.jobCard||'',cust:c.name||'',mobile:c.mobile||'',reason:c.lostReason||c.reason||''},'qms')?1:0;
        });
      } }catch(e){}
    // leave approved (today + tomorrow window) → LEAVE_APPROVED
    try{ var lv=L(LEAVE,null);
      if(lv&&lv.leaves){ Object.keys(lv.leaves).forEach(function(dk){
        (lv.leaves[dk]||[]).forEach(function(l){ var n=nm(l.staffName||l.empId||''); if(!n) return;
          emitted+=emit(bus,'LEAVE_APPROVED',dk+':'+kk(n),{name:n,date:dk,type:l.type||'full_day'},'leave')?1:0; });
      }); } }catch(e){}
    // DSR submitted → DSR_SUBMITTED
    try{ for(var i=0;i<localStorage.length;i++){ var lk=localStorage.key(i);
      var m=lk&&lk.match(/^saagar_dsr_(\d{4}-\d{2}-\d{2})_(.+)$/); if(!m) continue;
      var r=L(lk,null); if(r&&r.submitted) emitted+=emit(bus,'DSR_SUBMITTED',m[1]+':'+kk(m[2].replace(/_/g,' ')),{date:m1(m),name:nm((r.staffName||m[2].replace(/_/g,' '))),score:(r.audit&&r.audit.score)||null},'dsr')?1:0;
    } function m1(x){return x[1];} }catch(e){}
    // stock closing locked → STOCK_LOCKED
    try{ for(var j=0;j<localStorage.length;j++){ var sk=localStorage.key(j); var sm=sk&&sk.match(STOCK_RE); if(!sm) continue;
      var sb=L(sk,null); if(sb&&sb.closingLocked) emitted+=emit(bus,'STOCK_LOCKED',sm[1]+':'+sm[2],{store:sm[1],date:sm[2]},'stock')?1:0;
    } }catch(e){}
    // cash statement closed → CASH_CLOSED (read-only; Expense untouched)
    try{ var st=L(EXP_STMT,null);
      if(st&&typeof st==='object') Object.keys(st).forEach(function(dk){ var s=st[dk]; if(s&&s.closed) emitted+=emit(bus,'CASH_CLOSED',(s.date||dk),{date:s.date||dk},'expense')?1:0; });
    }catch(e){}
    // payroll month present → PAYROLL_MONTH
    try{ var pb=L(PAYROLL,null); if(pb&&pb.meta&&pb.meta.month) emitted+=emit(bus,'PAYROLL_MONTH',pb.meta.year+'-'+pb.meta.month,{month:pb.meta.month,year:pb.meta.year},'payroll')?1:0; }catch(e){}
    if(emitted) blog('bus +'+emitted+' event(s)');
    return emitted;
  }

  /* ── CONSUMERS ─────────────────────────────────────────────────────── */
  function dsrKey(date,name){ return DSR+date+'_'+nm(name).replace(/\s+/g,'_'); }
  function ensureDsr(date,name){
    var k=dsrKey(date,name), r=L(k,null);
    if(!r||typeof r!=='object') r={date:date,staffName:nm(name),role:'CRO',loginTime:'',submitTime:'',submitted:false,audit:{},opening:{},closing:{},inout:[],sales:[],nonpurch:[],tasks:{},marketing:{},cleaning:{},_bridgeCreated:true};
    if(!Array.isArray(r.sales))r.sales=[]; if(!Array.isArray(r.nonpurch))r.nonpurch=[];
    return {k:k,r:r};
  }
  function hasRef(arr,ref){ return arr.some(function(x){return x&&x.sourceRef===ref;}); }

  function consumeQmsToDsr(bus){
    var track=L(Q2D,{}); if(typeof track!=='object'||!track)track={};
    function handle(e,kind){
      var p=e.payload||{}; if(!p.cro||!p.date) return false;
      var ed=ensureDsr(p.date,p.cro);
      if(kind==='sale'||kind==='service'){
        if(hasRef(ed.r.sales,p.cid)) { track[p.cid]=track[p.cid]||{at:e.at}; return true; }
        ed.r.sales.push({amount:p.amount||0,billNo:p.bill||'',customer:p.cust||'',mobile:p.mobile||'',type:kind==='service'?'service':'sale',source:'qms',sourceRef:p.cid,_confirmed:false});
      } else {
        if(hasRef(ed.r.nonpurch,p.cid)) { track[p.cid]=track[p.cid]||{at:e.at}; return true; }
        ed.r.nonpurch.push({customer:p.cust||'',mobile:p.mobile||'',reason:p.reason||'non-purchase',source:'qms',sourceRef:p.cid,_confirmed:false});
      }
      S(ed.k,ed.r); track[p.cid]={dsr:ed.k,at:new Date().toISOString(),cro:p.cro,kind:kind}; return true;
    }
    var n=0;
    n+=consume(bus,'SALE_CLOSED','dsr',function(e){return handle(e,'sale');});
    n+=consume(bus,'SERVICE_CLOSED','dsr',function(e){return handle(e,'service');});
    n+=consume(bus,'NONPURCHASE_CLOSED','dsr',function(e){return handle(e,'np');});
    if(n){ S(Q2D,track); blog('QMS→DSR auto-filled '+n); }
    return n;
  }

  function computeGate(bus){
    var d=today(), blocked=[], cleared=[], seen={}, C=cfg();
    bus.forEach(function(e){
      if(e.type==='GROOMING_RESULT' && e.payload && e.payload.date===d){
        var p=e.payload; if(p.pct<C.failPct){ blocked.push({name:p.name,why:'grooming '+Math.round(p.pct)+'%'}); seen[kk(p.name)]=1; }
        else cleared.push(p.name);
      }
    });
    if(C.leaveGates) bus.forEach(function(e){
      if(e.type==='LEAVE_APPROVED' && e.payload && e.payload.date===d){
        var n=e.payload.name; if(!seen[kk(n)]){ blocked.push({name:n,why:'on leave'}); seen[kk(n)]=1; }
      }
    });
    var prev=L(GATE,null), status={date:d,blocked:blocked,cleared:cleared,generatedAt:new Date().toISOString()};
    if(!prev||prev.date!==d||JSON.stringify(prev.blocked)!==JSON.stringify(blocked)){ S(GATE,status); if(blocked.length) blog('gate: '+blocked.length+' blocked'); }
    return status;
  }

  function consumeDsrToStock(bus){
    var d=today(), agg={WLMHW:{open:0,close:0,cros:[]},HEMW:{open:0,close:0,cros:[]}}, touched=false;
    consume(bus,'DSR_SUBMITTED','stock',function(e){
      var p=e.payload||{}; if(!p.date||p.date.slice(0,10)!==d) return true; // only today rolls up; older marked done
      var k=dsrKey(p.date,p.name), r=L(k,null); if(!r) return true;
      var st=(r.store||r.storeCode||'WLMHW').toUpperCase(), b=agg[st]||agg.WLMHW;
      function sum(o){var t=0;if(o&&typeof o==='object')Object.keys(o).forEach(function(x){var v=Number(o[x]&&(o[x].counted||o[x].physical||o[x].qty)||o[x]);if(!isNaN(v))t+=v;});return t;}
      b.open+=sum(r.opening); b.close+=sum(r.closing); if(r.staffName)b.cros.push(r.staffName); touched=true; return true;
    });
    if(touched) ['WLMHW','HEMW'].forEach(function(sc){
      if(!agg[sc].cros.length) return;
      var sk='saagar_stock_'+sc+'_'+d, sb=L(sk,null); if(!sb||typeof sb!=='object') sb={};
      sb._dsrRollup={openingTotal:agg[sc].open,closingTotal:agg[sc].close,cros:agg[sc].cros,source:'dsr',note:'Auto roll-up from DSR — informational; SM count/lock unaffected',at:new Date().toISOString()};
      S(sk,sb);
    });
  }

  function consumeAttendanceFeed(bus){
    var m=ym(today()), feed=L(ATT,{}); if(typeof feed!=='object'||!feed)feed={};
    var month=feed[m]||{};
    consume(bus,'DSR_SUBMITTED','payroll',function(e){
      var p=e.payload||{}; if(!p.date||p.date.slice(0,7)!==m) return true;
      var o=month[nm(p.name)]||{present:0,leave:0,half:0,dsrDays:0,scoreSum:0,scoreN:0};
      o.present++; o.dsrDays++; if(p.score!=null){o.scoreSum+=Number(p.score)||0;o.scoreN++;}
      month[nm(p.name)]=o; return true;
    });
    consume(bus,'LEAVE_APPROVED','payroll',function(e){
      var p=e.payload||{}; if(!p.date||p.date.slice(0,7)!==m) return true;
      var o=month[nm(p.name)]||{present:0,leave:0,half:0,dsrDays:0,scoreSum:0,scoreN:0};
      if((p.type||'full_day')==='full_day') o.leave++; else o.half++;
      month[nm(p.name)]=o; return true;
    });
    Object.keys(month).forEach(function(n){ var o=month[n]; o.avgScore=o.scoreN?Math.round(o.scoreSum/o.scoreN):null; });
    feed[m]=month; feed._generatedAt=new Date().toISOString();
    feed._note='DSR present-days + SM avgScore + LeaveDesk leave-days. Payroll maker reconciles before lock.';
    S(ATT,feed);
  }

  /* ── LINK 1: DSR/QMS/Grooming → CRO Daily Audit (derived-inputs feed) ── */
  function consumeCroAuditFeed(bus){
    var feed=L(CRO_FEED,{}); if(typeof feed!=='object'||!feed)feed={};
    function slot(date,name){ feed[date]=feed[date]||{}; var k=kk(name); feed[date][k]=feed[date][k]||{cro:nm(name),date:date,groomingPct:null,qmsSales:0,qmsSalesAmt:0,qmsNonPurch:0,dsrSubmitted:false,dsrScore:null}; return feed[date][k]; }
    consume(bus,'GROOMING_RESULT','croaudit',function(e){var p=e.payload||{};if(!p.name||!p.date)return true;slot(p.date,p.name).groomingPct=Math.round(p.pct||0);return true;});
    consume(bus,'SALE_CLOSED','croaudit',function(e){var p=e.payload||{};if(!p.cro||!p.date)return true;var s=slot(p.date,p.cro);s.qmsSales++;s.qmsSalesAmt+=p.amount||0;return true;});
    consume(bus,'NONPURCHASE_CLOSED','croaudit',function(e){var p=e.payload||{};if(!p.cro||!p.date)return true;slot(p.date,p.cro).qmsNonPurch++;return true;});
    consume(bus,'DSR_SUBMITTED','croaudit',function(e){var p=e.payload||{};if(!p.name||!p.date)return true;var s=slot(p.date,p.name);s.dsrSubmitted=true;if(p.score!=null)s.dsrScore=p.score;return true;});
    feed._note='Auto-derived CRO audit inputs (grooming %, QMS sales/non-purchase, DSR submit/score). SM confirms in CRO Daily Audit.';
    feed._generatedAt=new Date().toISOString();
    S(CRO_FEED,feed);
  }

  /* ── LINK 2: QMS service lead → Watch Service Centre stub case ── */
  function consumeQmsServiceToWsc(bus){
    var cur=L(WSC,null);
    if(cur!=null && !Array.isArray(cur)) return;            // unknown shape — never corrupt
    var arr=Array.isArray(cur)?cur:[];
    var have={}; arr.forEach(function(c){ if(c&&c.sourceRef) have[c.sourceRef]=1; });
    var added=0;
    consume(bus,'SERVICE_CLOSED','wsc',function(e){
      var p=e.payload||{}; if(!p.cid) return true;
      if(have[p.cid]) return true;
      arr.push({id:'wsc_'+p.cid,status:'open',source:'qms',sourceRef:p.cid,
        custName:p.cust||'',custMobile:p.mobile||'',dateRec:(p.date||today()),
        advisor:p.cro||'',brand:'',model:'',_bridgeStub:true,
        note:'Auto-created from a QMS service lead — open and complete the intake.'});
      have[p.cid]=1; added++; return true;
    });
    if(added){ S(WSC,arr); blog('QMS→WSC stub +'+added); }
  }

  /* ── LINK 4: Payroll statutory + Expense GST → Tax "amount payable" ── */
  function buildTaxPayable(){
    try{
      var m=ym(today()), out=L(TAXPAY,{}); if(typeof out!=='object'||!out)out={};
      var rec={month:m,pf:0,esic:0,pt:0,gstEstimate:0,sources:[],at:new Date().toISOString()};
      var pb=L(PAYROLL,null);
      if(pb&&Array.isArray(pb.rows)&&pb.meta){
        var py=pb.meta.year+'-'+String(pb.meta.month||'').slice(0,3);
        pb.rows.forEach(function(r){ rec.pf+=Number(r.pf||r.pfAmt||0)||0; rec.esic+=Number(r.esic||r.esicAmt||0)||0; rec.pt+=Number(r.pt||r.ptAmt||0)||0; });
        if(rec.pf||rec.esic||rec.pt) rec.sources.push('payroll('+py+')');
        else rec.sources.push('payroll(no statutory fields — see Payroll module)');
      }
      var ef=L(EXP_TAXFEED,null);  // Expense Manager v2 already writes this (read-only here)
      if(ef&&ef[m]&&typeof ef[m].gstEstimate!=='undefined'){ rec.gstEstimate=Number(ef[m].gstEstimate)||0; rec.sources.push('expense.gm_tax_feed'); }
      out[m]=rec; out._note='Best-effort: PF/ESIC/PT from Payroll rows + GST estimate from Expense Manager. Verify with CA before filing.';
      S(TAXPAY,out);
    }catch(e){}
  }

  /* ── LINK 5: Exceptions Hub — one aggregated red-flag feed ── */
  function buildExceptions(bus){
    try{
      var d=today(), ex=[];
      var g=L(GATE,{blocked:[]}); (g.blocked||[]).forEach(function(b){ ex.push({sev:'high',area:'Floor gate',msg:b.name+' — '+b.why+' (blocked from floor)',at:d}); });
      // QMS open leads today
      try{ var q=L(QMS,null); if(q&&Array.isArray(q.customers)){
        var open=q.customers.filter(function(c){var t=(c.walkInTime||'')+'';return t.slice(0,10)===d && !(c.outcome) && c.status!=='closed';}).length;
        if(open) ex.push({sev:'med',area:'QMS',msg:open+' open lead(s) not closed today',at:d});
      } }catch(e){}
      // Stock not locked today
      try{ ['WLMHW','HEMW'].forEach(function(sc){ var sb=L('saagar_stock_'+sc+'_'+d,null);
        if(sb&&typeof sb==='object'&&!sb.closingLocked) ex.push({sev:'med',area:'Stock',msg:sc+' closing not locked today',at:d});
      }); }catch(e){}
      // Cash statement today not closed / mismatch (read-only)
      try{ var stm=L(EXP_STMT,null); if(stm&&stm[d]){ var s=stm[d];
        if(!s.closed) ex.push({sev:'med',area:'Cash',msg:'Cash statement not closed today',at:d});
        if(s.mismatchReason) ex.push({sev:'high',area:'Cash',msg:'Cash mismatch: '+String(s.mismatchReason).slice(0,60),at:d});
      } }catch(e){}
      // Missing vouchers (Expense ledger today, >2000, no photo) — read-only
      try{ var led=L(EXP_LEDGER,null); if(Array.isArray(led)){
        var vth=cfg().voucherThreshold;
        var mv=led.filter(function(x){return x&&!x.void&&(x.date||'')===d&&(x.type||'expense')!=='income'&&Number(x.amount)>vth&&!x.billPhoto;}).length;
        if(mv) ex.push({sev:'low',area:'Expense',msg:mv+' expense(s) >₹'+vth+' today without a bill photo',at:d});
      } }catch(e){}
      // Tax payable due (from our own feed)
      try{ var tp=L(TAXPAY,{})[ym(d)]; if(tp&&(tp.pf||tp.esic||tp.pt||tp.gstEstimate)) ex.push({sev:'low',area:'Tax',msg:'Statutory payable accruing this month (PF/ESIC/PT/GST) — see Tax',at:d}); }catch(e){}
      ex.sort(function(a,b){var o={high:0,med:1,low:2};return o[a.sev]-o[b.sev];});
      S(EXC,{date:d,items:ex,generatedAt:new Date().toISOString()});
    }catch(e){}
  }

  /* ── EMPLOYEE MASTER UNION (reconcile, not event) ──────────────────── */
  /* ONE-WAY: the Employee Master is the single source of truth (edited in
     Settings → People). The bridge no longer harvests module staff lists into
     it (that was leaking QMS demo CROs everywhere). It only PUSHES the master
     into QMS/DSR, and preserves every master field (gender, empId, dept…). */
  var DEMO_STUBS={rahul:1,priya:1,neha:1,amit:1,suresh:1};
  function reconcileEmployeeMaster(){
    try{
      var master=L(EMP_MASTER,[]); if(!Array.isArray(master))master=[];
      var by={};
      master.forEach(function(e){
        var n=(e&&e.name)||e; if(!n) return; var k=kk(n);
        var obj=(e&&typeof e==='object')?e:{};
        // drop legacy auto-harvested demo stubs (no real details = not user-curated)
        if(DEMO_STUBS[k] && !obj.gender && !obj.empId && !obj.dept) return;
        by[k]=Object.assign({},obj,{name:nm(n),active:!(obj&&obj.active===false)});
      });
      var union=Object.keys(by).map(function(k){return by[k];}).sort(function(a,b){return a.name.localeCompare(b.name);});
      if(JSON.stringify(union)!==JSON.stringify(master)){ S(EMP_MASTER,union); blog('emp-master cleaned '+union.length); }
      // master → QMS roster (dedupe by name)
      var q=L(QMS,null);
      if(q&&Array.isArray(q.cros)){var h={};q.cros.forEach(function(c){if(c&&c.name)h[kk(c.name)]=1;});var add=0;
        union.forEach(function(u){if(!h[kk(u.name)]){q.cros.push({id:'emp_'+kk(u.name).replace(/[^a-z0-9]/g,''),name:u.name,active:true});add++;}});
        if(add){S(QMS,q);blog('seeded '+add+' → QMS roster');}}
      // master → DSR staff list (dedupe by name)
      var ds=L(DSR_STAFF,null), da=Array.isArray(ds)?ds.slice():[],dh={};
      da.forEach(function(n){dh[kk(n)]=1;});var dadd=0;
      union.forEach(function(u){if(!dh[kk(u.name)]){da.push(u.name);dadd++;}});
      if(dadd){S(DSR_STAFF,da);blog('seeded '+dadd+' → DSR list');}
      try{ S('saagar_cros', union.map(function(u){return u.name;})); }catch(e){}
    }catch(e){}
  }

  /* ── PHASE 2: SHARED MASTERS → modules (add once, appears everywhere) ──
     Seeds each module's own list from the canonical masters (dedupe, one-way)
     and harvests module-local additions back into the masters (union), so the
     masters stay complete. Idempotent: only writes on an actual change. */
  function reconcileMasters(){
    try{
      var emp=L(EMP_MASTER,[]); if(!Array.isArray(emp))emp=[];
      var empNames=emp.filter(function(e){return e&&e.name&&e.active!==false;});
      // employees → Leave staff master (fixes "add employees again in Leave")
      try{ var lv=L(LEAVE,null);
        if(lv&&typeof lv==='object'){ if(!Array.isArray(lv.employees))lv.employees=[];
          var lh={}; lv.employees.forEach(function(x){var n=x&&(x.name||x); if(n)lh[kk(n)]=1;});
          var ladd=0; empNames.forEach(function(e){ if(!lh[kk(e.name)]){ lv.employees.push({id:'emp_'+kk(e.name).replace(/[^a-z0-9]/g,''),name:e.name,employeeId:e.empId||'',department:e.dept||''}); ladd++; } });
          if(ladd){ S(LEAVE,lv); blog('seeded '+ladd+' → Leave staff'); } } }catch(e){}
      // brands: union master ↔ saagar_brands {store:[names]}
      try{ var mb=L(MK_BRANDS,[]); if(!Array.isArray(mb))mb=[];
        var sb=L('saagar_brands',null); if(!sb||typeof sb!=='object')sb={};
        var mbKey={}; mb.forEach(function(b){ if(b&&b.name)mbKey[kk(b.name)+'|'+(b.store||'')]=1; });
        var mbCh=false;
        Object.keys(sb).forEach(function(store){ (sb[store]||[]).forEach(function(nm){ if(nm){ var k=kk(nm)+'|'+store; if(!mbKey[k]&&!mbKey[kk(nm)+'|']){ mb.push({name:String(nm),store:store}); mbKey[k]=1; mbCh=true; } } }); });
        if(mbCh) S(MK_BRANDS,mb);
        var stores=['WLMHW','HEMW'], sbCh=false;
        mb.forEach(function(b){ if(!b||!b.name)return; var tg=b.store?[b.store]:stores; tg.forEach(function(st){ if(!Array.isArray(sb[st]))sb[st]=[]; if(!sb[st].some(function(n){return kk(n)===kk(b.name);})){ sb[st].push(b.name); sbCh=true; } }); });
        if(sbCh){ S('saagar_brands',sb); blog('seeded brands → Stock'); } }catch(e){}
      // vendors: union master ↔ gm_vendors [{name}]
      try{ var mv=L(MK_VENDORS,[]); if(!Array.isArray(mv))mv=[];
        var gv=L('gm_vendors',[]); if(!Array.isArray(gv))gv=[];
        var mvKey={}; mv.forEach(function(v){ if(v&&v.name)mvKey[kk(v.name)]=1; }); var mvCh=false;
        gv.forEach(function(v){ var n=v&&(v.name||v); if(n&&!mvKey[kk(n)]){ mv.push({name:String(n),gstin:(v&&v.gstin)||''}); mvKey[kk(n)]=1; mvCh=true; } });
        if(mvCh) S(MK_VENDORS,mv);
        var gvKey={}; gv.forEach(function(v){var n=v&&(v.name||v); if(n)gvKey[kk(n)]=1;}); var gvCh=false;
        mv.forEach(function(v){ if(v&&v.name&&!gvKey[kk(v.name)]){ gv.push({name:v.name}); gvKey[kk(v.name)]=1; gvCh=true; } });
        if(gvCh){ S('gm_vendors',gv); blog('seeded vendors → Expense'); } }catch(e){}
      // customers: harvest QMS + WSC → master (one-way; customers are created in modules)
      try{ var mc=L(MK_CUSTOMERS,[]); if(!Array.isArray(mc))mc=[];
        var mcKey={}; mc.forEach(function(c){ if(c&&c.name)mcKey[kk(c.name)+'|'+(c.mobile||'')]=1; }); var mcCh=false;
        function addCust(n,mob){ if(!n)return; var k=kk(n)+'|'+(mob||''); if(!mcKey[k]){ mc.push({name:String(n),mobile:String(mob||'')}); mcKey[k]=1; mcCh=true; } }
        var q=L(QMS,null); if(q&&Array.isArray(q.customers)) q.customers.forEach(function(c){ if(c&&c.name)addCust(c.name,c.mobile); });
        var w=L(WSC,null); if(Array.isArray(w)) w.forEach(function(c){ if(c&&c.custName)addCust(c.custName,c.custMobile); });
        if(mcCh){ S(MK_CUSTOMERS,mc); blog('harvested customers → master'); } }catch(e){}
    }catch(e){}
  }

  /* ── ORGANISATION PUBLISHER (additive; never overwrites user data) ─── */
  function publishOrg(){
    var res={payroll:'skipped',taxFirmsAdded:0};
    try{
      var org=L(ORG_MASTER,null); if(!org||!Array.isArray(org.firms)) return res;
      var activeFirms=org.firms.filter(function(f){return f&&f.active!==false&&f.name;});
      // Payroll: seed firmName/firmAddr only if blank
      try{ var pb=L(PAYROLL,null);
        if(pb&&pb.meta){
          var want=activeFirms.find(function(f){return f.code===(pb.meta.firmCode||'');})||activeFirms.find(function(f){return f.code==='SAT';})||activeFirms[0];
          if(want){
            var changed=false;
            if(!nm(pb.meta.firmName)){ pb.meta.firmName=want.name; changed=true; }
            if(!nm(pb.meta.firmAddr)&&nm(want.address)){ pb.meta.firmAddr=want.address; changed=true; }
            if(changed){ S(PAYROLL,pb); res.payroll='seeded "'+want.name+'"'; blog('org→payroll firm seeded'); }
            else res.payroll='kept (already set)';
          }
        } }catch(e){ res.payroll='error'; }
      // Tax: additively add firms not present (match by name)
      try{ var tx=L(TAX,null);
        if(tx&&typeof tx==='object'){
          if(!Array.isArray(tx.firms)) tx.firms=[];
          var have={}; tx.firms.forEach(function(f){ if(f&&f.name) have[kk(f.name)]=1; });
          activeFirms.forEach(function(f){ if(!have[kk(f.name)]){ tx.firms.push({id:'org_'+(f.code||kk(f.name)),name:f.name,pan:f.pan||'',gstin:f.gstin||'',entityType:'',source:'org'}); res.taxFirmsAdded++; } });
          if(res.taxFirmsAdded){ S(TAX,tx); blog('org→tax +'+res.taxFirmsAdded+' firm(s)'); }
        } }catch(e){}
    }catch(e){}
    return res;
  }

  /* ── ORCHESTRATION ─────────────────────────────────────────────────── */
  /* Re-entrancy lock + storage debounce. A module write (e.g. QMS creating a
     rotation) fires a 'storage' event in the shell; without this guard a
     burst of writes could re-enter cycle() repeatedly and freeze the app. */
  var _running=false, _lastCycle=0;
  function safeCycle(fromStorage){
    var now=Date.now();
    if(_running) return;
    if(fromStorage && (now-_lastCycle)<4000) return;   // debounce storm
    _running=true; _lastCycle=now;
    try{ cycle(); }catch(e){}
    finally{ _running=false; }
  }
  function cycle(){
    var bus=busLoad();
    produce(bus);
    consumeQmsToDsr(bus);
    consumeDsrToStock(bus);
    consumeAttendanceFeed(bus);
    consumeCroAuditFeed(bus);
    consumeQmsServiceToWsc(bus);
    computeGate(bus);
    busSave(bus);
    reconcileEmployeeMaster();
    reconcileMasters();
    publishOrg();
    buildTaxPayable();
    buildExceptions(bus);
  }

  window.SaagarBridge={
    runNow:function(){cycle();return this.status();},
    publishOrg:function(){var r=publishOrg();blog('manual org publish');return r;},
    bus:function(){return busLoad();},
    events:function(type){var b=busLoad();return type?b.filter(function(e){return e.type===type;}):b;},
    exceptions:function(){return L(EXC,{items:[]});},
    croAuditFeed:function(){return L(CRO_FEED,{});},
    taxPayable:function(){return L(TAXPAY,{});},
    config:function(){return cfg();},
    status:function(){var b=busLoad();var byType={};b.forEach(function(e){byType[e.type]=(byType[e.type]||0)+1;});
      var exc=L(EXC,{items:[]});
      return {busEvents:b.length,byType:byType,employeeMaster:(L(EMP_MASTER,[])||[]).length,
        gate:L(GATE,{blocked:[]}),qms2dsrLinked:Object.keys(L(Q2D,{})||{}).length,
        org:!!L(ORG_MASTER,null),exceptions:(exc.items||[]).length,
        recentLog:(L(LOGK,[])||[]).slice(0,12)};}
  };

  /* gate banner in QMS / DSR (same as before) */
  function gateBanner(doc,modName){
    try{ if(!doc||!doc.body)return; var ex=doc.getElementById('__saagarGate'); if(ex)ex.parentNode.removeChild(ex);
      var g=L(GATE,{blocked:[]}); if(!g.blocked||!g.blocked.length)return;
      var names=g.blocked.map(function(b){return b.name+' ('+b.why+')';}).join(', ');
      var bar=doc.createElement('div'); bar.id='__saagarGate';
      bar.setAttribute('style','position:fixed;left:0;right:0;bottom:0;z-index:2147483646;background:#b91c1c;color:#fff;font:600 13px/1.4 Arial,sans-serif;padding:10px 14px;box-shadow:0 -4px 14px rgba(0,0,0,.25)');
      bar.innerHTML='⛔ <b>Floor gate ('+modName+')</b> — not cleared today: <b>'+names+'</b>. Do not assign / expect on floor until resolved.'+
        '<span style="float:right;cursor:pointer;font-weight:700;padding-left:12px" onclick="this.parentNode.style.display=\'none\'">✕</span>';
      doc.body.appendChild(bar);
    }catch(e){}
  }
  function hookFrame(){
    var f=document.getElementById('moduleFrame'); if(!f||f.__saagarBridgeBound)return; f.__saagarBridgeBound=true;
    f.addEventListener('load',function(){ try{
      // Show the (cheap) gate banner from the already-computed gate state FIRST, so the
      // module is immediately usable.
      var doc=f.contentDocument||(f.contentWindow&&f.contentWindow.document);
      if(doc){
        var t=(doc.title||'')+' '+((document.getElementById('activeTitle')||{}).textContent||'');
        if(/queue management|qms/i.test(t)) gateBanner(doc,'Queue Management');
        else if(/daily staff register/i.test(t)) gateBanner(doc,'Daily Staff Register');
      }
      // DEFER + DEBOUNCE the full reconcile. Previously this ran cycle() synchronously inside the
      // iframe 'load' handler, so opening a module blocked the main thread for the whole reconcile —
      // a real "open a module → it hangs" cause once localStorage/the bus grew large. Now the module
      // paints first; the reconcile runs after paint and is debounced (4s) so rapid opens don't each
      // trigger a full pass. Still eventually-consistent (also runs on the 60s tick + storage events).
      setTimeout(function(){ safeCycle(true); }, 50);
    }catch(e){} });
  }
  function init(){
    cycle(); hookFrame();
    var n=0,iv=setInterval(function(){hookFrame();if(++n>20)clearInterval(iv);},500);
    setInterval(function(){safeCycle(false);},TICK);
    window.addEventListener('storage',function(){safeCycle(true);});
    blog('integration bridge v2 (event bus) ready');
    console.log('[integration-bridge] event-bus ready');
  }
  if(document.readyState==='complete'||document.readyState==='interactive') init();
  else document.addEventListener('DOMContentLoaded',init);
})();
