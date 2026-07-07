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
     • WSC delivery → Expense income .... SERVICE_DELIVERED (central ledger)
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
  /* Stock keys: the Stock module saves under its INTERNAL key (titanworld/helios), while the rest of
     the app historically used the store CODE (WLMHW/HEMW). Accept both, and map code→internal-key so
     the bridge reads/writes the SAME blob Stock actually uses. */
  var STORE_KEY_MAP={WLMHW:'titanworld',HEMW:'helios'};
  function skey(code){ var c=String(code||'').toUpperCase(); return STORE_KEY_MAP[c]||String(code||'').toLowerCase(); }
  var LEAVE='leavedesk_v3', STOCK_RE=/^saagar_stock_(WLMHW|HEMW|titanworld|helios)_(\d{4}-\d{2}-\d{2})$/;
  var PAYROLL='payroll_suite_v1_2026', TAX='taxcal_v2', EXP_STMT='tanishq_statements';
  var CRO_FEED='saagar_cro_audit_feed', WSC='saagar_wsf_v2', TAXPAY='saagar_tax_payable';
  var EXC='saagar_exceptions', EXP_LEDGER='gm_expenses', EXP_TAXFEED='gm_tax_feed';
  var CFG='saagar_bridge_config';
  var MK_BRANDS='saagar_master_brands', MK_VENDORS='saagar_master_vendors', MK_CUSTOMERS='saagar_master_customers';
  var CUST_MASTER='saagar_customer_master_v1';   // Wave 3: derived mobile-keyed identity index (Customer 360 / Udhaar foundation)
  var FAIL_PCT=60, TICK=60000, BUS_CAP=2000;
  /* ── Bounding so the cross-module reconcile stays cheap regardless of total history. ──
     Producers only emit events whose ACTION date is within RECENT_DAYS (a closed lead is bounded by its
     CLOSE date so a late-closed old visit still flows; an open lead by its entry date). The bus is pruned
     to BUS_TTL_DAYS by the SAME business-date axis the producer filters on (BUS_TTL>RECENT so a consumed
     event is never re-emitted then re-pruned). The bus + CRO feed are written ONLY when they actually
     change, so an idle reconcile writes nothing — this is what stops the ~750KB whole-DB-persist burst
     that ANR-crashed QMS on device. Cutoffs are UTC to match the toISOString() timestamps compared. */
  var RECENT_DAYS=7, BUS_TTL_DAYS=14, FEED_KEEP_DAYS=60, Q2D_KEEP_DAYS=14;
  function cutoffIso(n){ var d=new Date(); d.setUTCDate(d.getUTCDate()-n); return d.toISOString().slice(0,10); }
  var _busDirty=false;   // set by emit()/consume(); gates the per-cycle bus write
  function cfg(){ var c=L(CFG,null)||{}; return {
    failPct: (typeof c.failPct==='number'&&c.failPct>=0&&c.failPct<=100)?c.failPct:60,
    leaveGates: c.leaveGates!==false,
    voucherThreshold: (typeof c.voucherThreshold==='number'&&c.voucherThreshold>=0)?c.voucherThreshold:2000,
    dsrClosingTime: (typeof c.dsrClosingTime==='string'&&/^\d{2}:\d{2}$/.test(c.dsrClosingTime))?c.dsrClosingTime:'20:30'   /* Wave4: EOD cutoff for the unsubmitted-DSR alert; SM-configurable, sane 8:30pm default */
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
  function busDate(e){ if(e&&e.rd) return String(e.rd).slice(0,10); return (e&&e.payload&&e.payload.date)?String(e.payload.date).slice(0,10):(e&&e.at?String(e.at).slice(0,10):''); }
  /* Prune the bus IN PLACE by business date (same axis the producer filters on, so an aged-out event is
     never re-emitted), then cap. Returns # removed; a non-zero return means the bus changed → write it. */
  function busPrune(b){
    var cut=cutoffIso(BUS_TTL_DAYS), kept=[], removed=0;
    for(var i=0;i<b.length;i++){ var e=b[i], ed=busDate(e); if(ed && ed<cut){ removed++; } else kept.push(e); }
    if(kept.length>BUS_CAP){ removed+=(kept.length-BUS_CAP); kept=kept.slice(kept.length-BUS_CAP); }
    b.length=0; for(var j=0;j<kept.length;j++) b.push(kept[j]);
    return removed;
  }
  function busSave(b){S(BUS,b);}
  function emit(bus,type,idSuffix,payload,src,rdate){
    var id=type+':'+idSuffix;
    for(var i=bus.length-1;i>=0 && i>bus.length-400;i--){ if(bus[i].id===id) return false; }
    if(bus.some(function(e){return e.id===id;})) return false;
    // rd = recency axis used for bus pruning. It MUST equal the date the producer gates emission on, so an
    // aged-out event is never re-emitted then re-pruned. For most events that is payload.date; for a QMS
    // CLOSED lead the gate is the CLOSE date (passed in) while payload.date stays the visit day for filing.
    var rd=String(rdate||(payload&&payload.date)||'').slice(0,10);
    bus.push({id:id,type:type,at:new Date().toISOString(),src:src||'',payload:payload||{},consumed:{},rd:rd});
    _busDirty=true;
    return true;
  }
  function consume(bus,type,who,fn){
    var n=0;
    bus.forEach(function(e){
      if(e.type!==type) return;
      e.consumed=e.consumed||{};
      if(e.consumed[who]) return;
      try{ if(fn(e)!==false){ e.consumed[who]=true; _busDirty=true; n++; } }
      catch(err){ /* bug bridge-05: a persistently-throwing handler used to be retried every cycle until it pruned out (up to 14 days of churn). Give up after 3 tries so a poison event stops re-processing; deterministic ids still prevent any double-apply on paths that DO succeed. */ e._err=e._err||{}; e._err[who]=(e._err[who]||0)+1; if(e._err[who]>=3){ e.consumed[who]=true; _busDirty=true; } }
    });
    return n;
  }

  /* ── PRODUCERS ─────────────────────────────────────────────────────── */
  function produce(bus){
    var emitted=0,d=today(),rc=cutoffIso(RECENT_DAYS);
    // grooming today → GROOMING_RESULT (Wave4 re-check: emit the LATEST record per name; the attempt number in
    // the event id lets an improved re-check post a NEW event past emit()'s dedupe while staying idempotent.)
    try{ var __grecs=L(GROOM+d,[])||[], __glast={};
      __grecs.forEach(function(r){ if(r&&r.name) __glast[kk(r.name)]=r; });
      Object.keys(__glast).forEach(function(gk){ var r=__glast[gk], at=Number(r.attempt)||1;
        emitted+=emit(bus,'GROOMING_RESULT',d+':'+gk+':'+at,{name:nm(r.name),pct:Number(r.pct)||0,date:d,attempt:at},'grooming')?1:0; });
    }catch(e){}
    // QMS closed leads → SALE/SERVICE/NONPURCHASE_CLOSED
    try{ var q=L(QMS,null);
      if(q&&Array.isArray(q.customers)){
        var cros={}; (q.cros||[]).forEach(function(c){if(c)cros[c.id]=c.name;});
        q.customers.forEach(function(c){
          if(!c) return; var out=(c.outcome||'').toLowerCase();
          var cid=c.id||c.mobile; if(!cid) return;
          var t=(c.exitTime||c.entryTime||c.walkInTime||'')+''; var dt=t?t.slice(0,10):'';   // visit/filing day; '' when undated → skipped (never default to today, else undated rows flood the bus)
          var cro=cros[c.assignedCroId]||cros[c.allocatedCroId]||cros[c.croId]||c.croName||c.allocatedCroName||'';
          var isClosed=/closed/i.test(String(c.status||''));
          // O1: allocated-but-not-closed → DSR Visitors tab. Bound on the entry/visit day; an 8-day-old still-open lead is stale.
          if(!out && !isClosed && cro && dt && dt>=rc){ emitted+=emit(bus,'QMS_ALLOCATED',String(cid),{cid:cid,cro:cro,date:dt,cust:c.name||'',mobile:c.mobile||'',queueNo:c.queueNo||'',visit:c.visitType||'',prod:c.productInterest||''},'qms')?1:0; }
          if(!out&&!isClosed) return; if(!out) return;
          // CLOSED → bound on the CLOSE/action day (a sale closed today for an old visit must still flow); file under the visit day (dt).
          var rcDate=String(c.closedAt||c.exitTime||c.entryTime||c.walkInTime||'').slice(0,10);
          if(!rcDate || rcDate<rc) return;
          var type= out==='purchase'?'SALE_CLOSED' : out==='service'?'SERVICE_CLOSED' : 'NONPURCHASE_CLOSED';
          emitted+=emit(bus,type,String(cid),{cid:cid,cro:cro,date:(dt||rcDate),amount:Number(c.purchaseAmount||c.amount)||0,bill:c.billNo||c.jobCardNo||c.jobCard||'',prod:c.purchaseCategory||c.productInterest||'',cust:c.name||'',mobile:c.mobile||'',reason:c.lostReason||c.reason||''},'qms',rcDate)?1:0;
        });
      } }catch(e){}
    // leave approved (today + tomorrow window) → LEAVE_APPROVED
    try{ var lv=L(LEAVE,null);
      if(lv&&lv.leaves){ Object.keys(lv.leaves).forEach(function(dk){
        if(String(dk).slice(0,10)<rc) return;   // skip leaves older than RECENT_DAYS (today + upcoming kept) — else prune/re-emit loop
        (lv.leaves[dk]||[]).forEach(function(l){ if(l&&l.status&&l.status!=='approved') return;   /* W2-4: pending/rejected never reach the floor gate or payroll; rows with NO status are legacy-approved */
          var n=nm(l.staffName||l.name||l.empId||''); if(!n) return;
          emitted+=emit(bus,'LEAVE_APPROVED',dk+':'+kk(n),{name:n,date:dk,type:l.type||'full_day'},'leave')?1:0; });
      }); } }catch(e){}
    // DSR submitted → DSR_SUBMITTED
    try{ for(var i=0;i<localStorage.length;i++){ var lk=localStorage.key(i);
      var m=lk&&lk.match(/^saagar_dsr_(\d{4}-\d{2}-\d{2})_(.+)$/); if(!m) continue;
      if(m[1]<rc) continue;   // recent days only — old DSR keys must not re-flood the bus every cycle
      var r=L(lk,null); if(r&&r.submitted){ var _rev=(typeof r.submitRev==='number'&&r.submitRev>0)?r.submitRev:0; emitted+=emit(bus,'DSR_SUBMITTED',m[1]+':'+kk(m[2].replace(/_/g,' '))+(_rev?':v'+_rev:''),{date:m1(m),name:nm((r.staffName||m[2].replace(/_/g,' '))),score:(r.audit&&r.audit.score)||null,rev:_rev},'dsr')?1:0; }   /* P1-12: a corrected re-submit (submitRev>=1) posts a fresh id past emit() dedupe; rev 0 = identical id to before (no orphaned events) */
      // W2-3: DSR visitor marked "Purchase" AND billed (qms-visitor sale row with bill+amount saved via
      // saveSale) → DSR_PURCHASE. QMS reads these off the bus at render time and flags the open lead
      // "purchased in DSR — confirm & close" (see consumeDsrPurchaseAck + the qms.html reader).
      // Emitted only once bill AND amount exist: an event payload is frozen at first emit, so emitting
      // at mark-time would freeze empty bill/amount and the QMS pre-fill would be useless. Gated by the
      // record date (m[1], already >= rc here) and rd=m[1], so a pruned event is never re-emitted.
      // Rows with source 'qms' (pushed INTO DSR by a QMS close) never match — no echo at the source.
      if(r&&Array.isArray(r.sales)) r.sales.forEach(function(s){
        if(!s||s.source!=='qms-visitor'||!s.sourceRef) return;
        var _bill=String(s.billNo||'').trim(), _amt=Number(s.amount)||0;
        if(!_bill||_amt<=0) return;
        emitted+=emit(bus,'DSR_PURCHASE',String(s.sourceRef),{cid:String(s.sourceRef),bill:_bill,amount:_amt,date:m[1],cro:nm(r.staffName||m[2].replace(/_/g,' ')),product:s.product||'',cust:s.customer||'',mobile:s.mobile||''},'dsr',m[1])?1:0;
      });
    } function m1(x){return x[1];} }catch(e){}
    // stock closing locked → STOCK_LOCKED
    try{ for(var j=0;j<localStorage.length;j++){ var sk=localStorage.key(j); var sm=sk&&sk.match(STOCK_RE); if(!sm) continue;
      if(sm[2]<rc) continue;   // recent days only
      var sb=L(sk,null); if(sb&&sb.closingLocked) emitted+=emit(bus,'STOCK_LOCKED',sm[1]+':'+sm[2],{store:sm[1],date:sm[2]},'stock')?1:0;
    } }catch(e){}
    // cash statement closed → CASH_CLOSED (read-only; Expense untouched)
    try{ var st=L(EXP_STMT,null);
      if(st&&typeof st==='object') Object.keys(st).forEach(function(dk){ var s=st[dk]; if(!s||!s.closed) return; var cd=String(s.date||dk).slice(0,10); if(cd<rc) return; emitted+=emit(bus,'CASH_CLOSED',(s.date||dk),{date:s.date||dk},'expense')?1:0; });
    }catch(e){}
    // WSC case delivered (closed with payment) → SERVICE_DELIVERED. Bounded on the CLOSE day like
    // SALE_CLOSED (rd = closedAt), so only cases closed in the last RECENT_DAYS flow automatically;
    // older history stays available via Expense's manual Sync tab. Zero/invalid finalAmt is NEVER
    // emitted (not consume-and-skip) so a later corrected re-close can still produce the income event.
    try{ var wl=L(WSC,null);
      if(Array.isArray(wl)) wl.forEach(function(c){
        if(!c||c.status!=='closed'||!c.id||!c.delivery) return;
        var wrc=String(c.closedAt||'').slice(0,10);
        if(!wrc||wrc<rc) return;
        var wamt=parseFloat(c.delivery.finalAmt); if(!(wamt>0)) return;
        var wfd=String(c.delivery.collectDate||'').slice(0,10);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(wfd)) wfd=wrc;   // file under the collection day; fall back to the close day
        emitted+=emit(bus,'SERVICE_DELIVERED',String(c.id),{cid:String(c.id),date:wfd,amount:wamt,mode:c.delivery.payMode||'',ref:c.delivery.payRef||'',cust:c.custName||'',brand:c.brand||'',model:c.model||'',advisor:c.advisor||''},'wsc',wrc)?1:0;
      });
    }catch(e){}
    // payroll month present → PAYROLL_MONTH
    try{ var pb=L(PAYROLL,null); if(pb&&pb.meta&&pb.meta.month) emitted+=emit(bus,'PAYROLL_MONTH',pb.meta.year+'-'+pb.meta.month,{month:pb.meta.month,year:pb.meta.year},'payroll')?1:0; }catch(e){}
    if(emitted) blog('bus +'+emitted+' event(s)');
    return emitted;
  }

  /* ── CONSUMERS ─────────────────────────────────────────────────────── */
  function dsrKey(date,name){ return DSR+date+'_'+nm(name).replace(/\s+/g,'_'); }
  /* P1-8: resolve a DSR record's store CODE. DSR records persist no store field
     (dsr.html blankRecord), so r.store||r.storeCode is empty today and everything
     bucketed WLMHW. Consult the employee master (same source dsr.html staffStore()
     uses; store = 'Titan World'|'Helios'). Fallback unchanged: WLMHW. */
  function dsrStoreCode(r){
    var s=String((r&&(r.store||r.storeCode))||'').toUpperCase();
    if(s==='WLMHW'||s==='HEMW') return s;
    var who=kk(r&&r.staffName);
    if(who){ var em=L(EMP_MASTER,[])||[];
      for(var i=0;i<em.length;i++){ var e=em[i];
        if(e&&e.active!==false&&kk(e.name)===who){
          var st2=kk(e.store);
          if(st2.indexOf('helios')>=0) return 'HEMW';
          if(st2.indexOf('titan')>=0)  return 'WLMHW';
          break; } } }
    return 'WLMHW';
  }
  /* P1-8: units sold per the DSR for one store/day, recomputed from ALL of that day's
     SUBMITTED records (not just this consume batch) so staggered multi-CRO submits and
     P1-12 corrected re-submits never double- or under-count. A "sale" = a confirmed
     product bill: Number(amount)>0 (dsr.html's own confirmed-bill convention, L1849/L2962)
     and not a QMS service job (type!=='service'). NOTE: DSR has no qty per bill, so this
     counts BILLS — copy in stock says so. */
  function dsrDaySales(date,code){
    var n=0, pre=DSR+date+'_';                    // DSR='saagar_dsr_'; 'saagar_dsr_staff' can't match
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i); if(!k||k.indexOf(pre)!==0) continue;
      var r=L(k,null); if(!r||r.submitted!==true) continue;   // excludes _bridgeCreated stubs too
      if(dsrStoreCode(r)!==code) continue;
      var arr=Array.isArray(r.sales)?r.sales:[];
      for(var j=0;j<arr.length;j++){ var s2=arr[j];
        if(s2 && s2.type!=='service' && (Number(s2.amount)||0)>0) n++; }
    }
    return n;
  }
  function ensureDsr(date,name){
    var k=dsrKey(date,name), r=L(k,null);
    if(!r||typeof r!=='object') r={date:date,staffName:nm(name),role:'CRO',loginTime:'',submitTime:'',submitted:false,audit:{},opening:{},closing:{},inout:[],sales:[],nonpurch:[],tasks:{},marketing:{},cleaning:{},_bridgeCreated:true};
    if(!Array.isArray(r.sales))r.sales=[]; if(!Array.isArray(r.nonpurch))r.nonpurch=[];
    return {k:k,r:r};
  }
  function hasRef(arr,ref){ return arr.some(function(x){return x&&x.sourceRef===ref;}); }

  function consumeQmsToDsr(bus){
    var track=L(Q2D,{}); if(typeof track!=='object'||!track)track={};
    // W2-3 anti-echo: a close whose sale ALREADY lives in DSR (the CRO marked it in the Visitors tab
    // and billed it — i.e. a DSR_PURCHASE event exists on this same bus) must NOT be pushed back into
    // DSR. hasRef() below only guards the SAME-DAY record; this set also covers a cross-day close
    // (entry yesterday → visitor row in yesterday's DSR record, but SALE_CLOSED files under the exit
    // day = today → different record key) and a reassigned-CRO close (different staff record).
    var dsrPurch={}; bus.forEach(function(e){ if(e&&e.type==='DSR_PURCHASE'&&e.payload&&e.payload.cid) dsrPurch[String(e.payload.cid)]=1; });
    function handle(e,kind){
      var p=e.payload||{}; if(!p.cro||!p.date) return false;
      var ed=ensureDsr(p.date,p.cro);
      if(kind==='sale'||kind==='service'){
        if(dsrPurch[String(p.cid)]) { track[p.cid]=track[p.cid]||{at:e.at,dsrOrigin:true}; return true; }
        if(hasRef(ed.r.sales,p.cid)) { track[p.cid]=track[p.cid]||{at:e.at}; return true; }
        ed.r.sales.push({amount:p.amount||0,billNo:p.bill||'',product:p.prod||(kind==='service'?'Service':'QMS Sale'),customer:p.cust||'',mobile:p.mobile||'',type:kind==='service'?'service':'sale',source:'qms',sourceRef:p.cid,_confirmed:false});
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
    if(n){
      // Prune stale trackers (keep entries with no .at). The producer never re-emits >RECENT_DAYS-old
      // events and hasRef() on the live DSR record is the real idempotency guard, so an aged-out tracker
      // can never cause a double-add. Q2D_KEEP_DAYS(14) > RECENT_DAYS(7) leaves a safe margin.
      var tcut=cutoffIso(Q2D_KEEP_DAYS);
      Object.keys(track).forEach(function(cid){ var a=track[cid]&&track[cid].at; if(a && String(a).slice(0,10)<tcut) delete track[cid]; });
      S(Q2D,track); blog('QMS→DSR auto-filled '+n);
    }
    return n;
  }

  /* O1: allocated-but-not-closed QMS customers → DSR record's visitors[] (a "Visitors" tab where
     staff mark Purchase/Non-purchase). Deduped by QMS customer id; if the lead is later closed in
     QMS, reflect that outcome unless staff already marked it. */
  function consumeQmsAllocatedToDsr(bus){
    var closedCid={};
    bus.forEach(function(e){ if(/^(SALE|SERVICE|NONPURCHASE)_CLOSED$/.test(e.type)){ var p=e.payload||{}; if(p.cid) closedCid[String(p.cid)]={out:e.type}; } });
    var n=consume(bus,'QMS_ALLOCATED','dsrvis',function(e){
      var p=e.payload||{}; if(!p.cro||!p.date||!p.cid) return false;
      var ed=ensureDsr(p.date,p.cro); var r=ed.r; if(!Array.isArray(r.visitors)) r.visitors=[];
      var cid=String(p.cid);
      var row=r.visitors.filter(function(v){return v&&String(v.sourceRef)===cid;})[0];
      if(!row){ row={sourceRef:cid,customer:p.cust||'',mobile:p.mobile||'',queueNo:p.queueNo||'',visit:p.visit||'',product:p.prod||'',outcome:null,source:'qms',at:new Date().toISOString()}; r.visitors.push(row); }
      var cl=closedCid[cid];
      if(cl && !row._staffMarked){ row.outcome = cl.out==='SALE_CLOSED'?'purchase':(cl.out==='SERVICE_CLOSED'?'service':'nonpurchase'); row.resolvedBy='qms'; }
      S(ed.k,r); return true;
    });
    if(n) blog('QMS allocated → DSR visitors '+n);
    return n;
  }

  /* W2-3: DSR→QMS write-back ACK (reverse direction of consumeQmsToDsr). The QMS module itself READS
     DSR_PURCHASE events off the bus at render time to flag open leads "purchased in DSR — confirm &
     close". The bridge must NEVER write into the QMS blob: QMS keeps its whole state in memory and
     saves it wholesale (save()/addAudit()), so a bridge-written field would be clobbered by the next
     QMS save — and would not render until reload anyway (QMS never re-loads from storage). This
     consumer only closes the loop on the bus: an event is marked consumed('qms') once the matching
     lead is Closed in QMS (any outcome — the SM's close is authoritative) or when no matching lead
     exists (silent no-op). While the lead stays open the event stays UNconsumed, so the QMS flag
     survives re-boots without ever duplicating (it is derived, not stored). */
  function consumeDsrPurchaseAck(bus){
    var q=L(QMS,null), byId={};
    if(q&&Array.isArray(q.customers)) q.customers.forEach(function(c){ if(c&&c.id) byId[String(c.id)]=c; });
    var n=consume(bus,'DSR_PURCHASE','qms',function(e){
      var p=e.payload||{}; if(!p.cid) return true;                 // malformed → consume as no-op
      var c=byId[String(p.cid)];
      if(!c) return true;                                          // no matching QMS lead → silent no-op
      if(/closed/i.test(String(c.status||''))) return true;        // lead closed → loop complete, ack
      return false;                                                // still open → keep the flag live
    });
    if(n) blog('DSR purchase → QMS ack '+n);
    return n;
  }

  function computeGate(bus){
    var d=today(), blocked=[], cleared=[], seen={}, C=cfg();
    // Wave4 re-check: with attempt-suffixed ids a name can have several GROOMING_RESULT events today. Pick the
    // LATEST attempt per name and decide the block ONCE, so a passing re-check removes the earlier fail block.
    var __groom={};
    bus.forEach(function(e){
      if(e.type==='GROOMING_RESULT' && e.payload && e.payload.date===d){
        var p=e.payload, gk=kk(p.name), at=Number(p.attempt)||1;
        if(!__groom[gk] || at>=__groom[gk].at) __groom[gk]={name:p.name,pct:p.pct,at:at};
      }
    });
    Object.keys(__groom).forEach(function(gk){ var g=__groom[gk];
      if(g.pct<C.failPct){ blocked.push({name:g.name,why:'grooming '+Math.round(g.pct)+'%'}); seen[gk]=1; }
      else cleared.push(g.name);
    });
    if(C.leaveGates) bus.forEach(function(e){
      if(e.type==='LEAVE_APPROVED' && e.payload && e.payload.date===d){
        /* bug bridge-03: only a FULL-day leave bars a person from the floor all day. Half-day-leave staff
           are present for half the day, so they belong in the "unavailable"/half-day map below — not the
           red floor-gate blocked[] banner ("do not assign / expect on floor until resolved"). */
        if((e.payload.type||'full_day')==='full_day'){ var n=e.payload.name; if(!seen[kk(n)]){ blocked.push({name:n,why:'on leave'}); seen[kk(n)]=1; } }
      }
    });
    // J: per-name "unavailable today" map so consumers filter dropdowns in one lookup. Leave
    //    (full or half day) sets leave:true; grooming-fail blocks are kept distinct (leave:false).
    var unavailable={};
    if(C.leaveGates) bus.forEach(function(e){ if(e.type==='LEAVE_APPROVED' && e.payload && e.payload.date===d){ var ln=e.payload.name, lt=e.payload.type||'full_day'; unavailable[kk(ln)]={name:nm(ln),reason:(lt==='full_day'?'on leave':'half day'),leave:true,type:lt}; } });
    blocked.forEach(function(b){ var k=kk(b.name); if(!unavailable[k]) unavailable[k]={name:b.name,reason:b.why,leave:/leave/i.test(b.why)}; });
    var prev=L(GATE,null), status={date:d,blocked:blocked,cleared:cleared,unavailable:unavailable,generatedAt:new Date().toISOString()};
    if(!prev||prev.date!==d||JSON.stringify(prev.blocked)!==JSON.stringify(blocked)||JSON.stringify((prev.unavailable||{}))!==JSON.stringify(unavailable)){ S(GATE,status); if(blocked.length) blog('gate: '+blocked.length+' blocked'); }
    return status;
  }

  function consumeDsrToStock(bus){
    var d=today(), agg={WLMHW:{open:0,close:0,cros:[]},HEMW:{open:0,close:0,cros:[]}}, touched=false;
    consume(bus,'DSR_SUBMITTED','stock',function(e){
      var p=e.payload||{}; if(!p.date||p.date.slice(0,10)!==d) return true; // only today rolls up; older marked done
      var k=dsrKey(p.date,p.name), r=L(k,null); if(!r) return true;
      var b=agg[dsrStoreCode(r)];   // P1-8: same resolver as salesCount so bucket + count agree
      function sum(o){var t=0;if(o&&typeof o==='object')Object.keys(o).forEach(function(x){var v=Number(o[x]&&(o[x].counted||o[x].physical||o[x].qty)||o[x]);if(!isNaN(v))t+=v;});return t;}
      b.open+=sum(r.opening); b.close+=sum(r.closing); if(r.staffName)b.cros.push(r.staffName); touched=true; return true;
    });
    if(touched) ['WLMHW','HEMW'].forEach(function(sc){
      if(!agg[sc].cros.length) return;
      var sk='saagar_stock_'+skey(sc)+'_'+d, sb=L(sk,null); if(!sb||typeof sb!=='object') sb={};
      sb._dsrRollup={openingTotal:agg[sc].open,closingTotal:agg[sc].close,cros:agg[sc].cros,source:'dsr',
        salesCount:dsrDaySales(d,sc),   /* P1-8: units (bills) sold per submitted DSRs, day-wide recompute */
        note:'Auto roll-up from DSR — informational; SM count/lock unaffected',at:new Date().toISOString()};
      S(sk,sb);
    });
  }

  function consumeAttendanceFeed(bus){
    /* W2-1 FIX: bucket each event by ITS OWN month (payload.date), not ym(today()).
       The old code returned true (consumed) on ANY month mismatch, so a leave approved
       28-Jun for 3-Jul was marked consumed['payroll'] in June and never reached July's
       feed; a late DSR/leave straggler dated last month was silently dropped too.
       Chosen predicate: CONSUME EVERY DATED EVENT EXACTLY ONCE into feed[<its month>].
       - future-dated leave lands in its target month's bucket immediately (payroll
         reads it when that month is selected) — consumed once, never retried;
       - past-month stragglers land in their own month (advisory only if locked);
       - nothing is ever left unconsumed to churn every cycle or be evicted by the
         BUS_CAP slice while still pending (which 'return false for future periods'
         would risk: rd=payload.date is future, so busPrune never ages it out).
       Idempotency unchanged: deterministic event ids + consumed['payroll'] flag. */
    var feed=L(ATT,{}); if(typeof feed!=='object'||!feed)feed={};
    /* One-time repair: pre-fix builds wrongly consumed future-month LEAVE_APPROVED
       events. Any such event dated in a month AFTER the current month that is already
       consumed can only have been DROPPED (its month has never been current), so
       un-consume it for re-processing. Guarded by a persisted flag so it runs once —
       post-fix future events that WERE bucketed are never un-consumed (double-count safe:
       flag and buckets live in the same blob/write). */
    var repaired=false;
    if(!feed._futureLeaveRepaired){
      var curM=ym(today());
      bus.forEach(function(e){
        if(e.type==='LEAVE_APPROVED'&&e.consumed&&e.consumed.payroll&&e.payload&&e.payload.date&&String(e.payload.date).slice(0,7)>curM){ delete e.consumed.payroll; _busDirty=true; }
      });
      feed._futureLeaveRepaired=true; repaired=true;
    }
    /* bug bridge-02 one-time migration: collapse any existing case-variant name buckets in each month into
       a single lowercased key (summing counts), so switching the bucket key to kk (below) never splits a
       person's present/leave days mid-month. Runs exactly once (guarded); avgScore recomputed after. */
    if(!feed._nameKeyKk){
      Object.keys(feed).forEach(function(em){
        if(em.charAt(0)==='_') return; var mo=feed[em]; if(!mo||typeof mo!=='object') return;
        var merged={};
        Object.keys(mo).forEach(function(k2){
          var o2=mo[k2]; if(!o2||typeof o2!=='object') return;
          var lk=kk(k2), t=merged[lk];
          if(!t){ t={present:0,leave:0,half:0,dsrDays:0,scoreSum:0,scoreN:0,display:nm(k2)}; merged[lk]=t; }
          t.present+=Number(o2.present)||0; t.leave+=Number(o2.leave)||0; t.half+=Number(o2.half)||0;
          t.dsrDays+=Number(o2.dsrDays)||0; t.scoreSum+=Number(o2.scoreSum)||0; t.scoreN+=Number(o2.scoreN)||0;
        });
        Object.keys(merged).forEach(function(lk){ var t=merged[lk]; t.avgScore=t.scoreN?Math.round(t.scoreSum/t.scoreN):null; });
        feed[em]=merged;
      });
      feed._nameKeyKk=true; repaired=true;   // reuse the "changed" flag so the migrated feed is persisted this cycle
    }
    var touched={};
    /* bug bridge-02: bucket by the LOWERCASED name (kk). DSR and LeaveDesk store the same person with
       independent casing, so keying by the raw name split 'Amit Kumar'/'amit kumar' into two buckets and
       payroll (which lowercases feed keys on read, last-wins) then under-counted. Carry a display name. */
    function slot(em,name){
      var mo=feed[em]; if(!mo||typeof mo!=='object'){mo={};feed[em]=mo;}
      touched[em]=1;
      var key=kk(name), o=mo[key]||{present:0,leave:0,half:0,dsrDays:0,scoreSum:0,scoreN:0};
      if(!o.display) o.display=nm(name);
      mo[key]=o; return o;
    }
    consume(bus,'DSR_SUBMITTED','payroll',function(e){
      var p=e.payload||{}; if(!p.date) return true;   // undated — consume & drop (unchanged behaviour)
      var o=slot(String(p.date).slice(0,7),nm(p.name));
      /* P1-12: a corrected re-submit (new :v<rev> id) posts a SECOND DSR_SUBMITTED for the same day.
         Guard by a per-(date:name) map so presence is counted ONCE; a re-submit only REPLACES the score. */
      o._dsrDays=o._dsrDays||{};
      var dayKey=String(p.date).slice(0,10)+'|'+kk(p.name);
      var sc=(p.score!=null)?(Number(p.score)||0):null;
      if(!(dayKey in o._dsrDays)){                        // FIRST submit for this day → count presence once
        o.present++; o.dsrDays++;
        if(sc!=null){o.scoreSum+=sc;o.scoreN++;}
        o._dsrDays[dayKey]=sc;
      } else {                                            // corrected RE-submit → replace score, do NOT re-count presence
        var prev=o._dsrDays[dayKey];
        if(prev!=null){o.scoreSum-=prev;o.scoreN--;}
        if(sc!=null){o.scoreSum+=sc;o.scoreN++;}
        o._dsrDays[dayKey]=sc;
      }
      return true;
    });
    consume(bus,'LEAVE_APPROVED','payroll',function(e){
      var p=e.payload||{}; if(!p.date) return true;
      var o=slot(String(p.date).slice(0,7),nm(p.name));
      if((p.type||'full_day')==='full_day') o.leave++; else o.half++;
      return true;
    });
    Object.keys(touched).forEach(function(em){
      var mo=feed[em];
      Object.keys(mo).forEach(function(n){ var o=mo[n]; if(o&&typeof o==='object'){ o.avgScore=o.scoreN?Math.round(o.scoreSum/o.scoreN):null; } });
    });
    if(Object.keys(touched).length||repaired){
      feed._generatedAt=new Date().toISOString();
      feed._note='DSR present-days + SM avgScore + LeaveDesk leave-days, bucketed by event month. Payroll maker reconciles before lock.';
      S(ATT,feed);   // write only when something changed — idle cycles no longer rewrite the feed blob
    }
  }

  /* ── LINK 1: DSR/QMS/Grooming → CRO Daily Audit (derived-inputs feed) ── */
  function consumeCroAuditFeed(bus){
    var feed=L(CRO_FEED,{}); if(typeof feed!=='object'||!feed)feed={};
    function slot(date,name){ feed[date]=feed[date]||{}; var k=kk(name); feed[date][k]=feed[date][k]||{cro:nm(name),date:date,groomingPct:null,qmsSales:0,qmsSalesAmt:0,qmsNonPurch:0,dsrSubmitted:false,dsrScore:null}; return feed[date][k]; }
    var n=0;
    n+=consume(bus,'GROOMING_RESULT','croaudit',function(e){var p=e.payload||{};if(!p.name||!p.date)return true;slot(p.date,p.name).groomingPct=Math.round(p.pct||0);return true;});
    n+=consume(bus,'SALE_CLOSED','croaudit',function(e){var p=e.payload||{};if(!p.cro||!p.date)return true;var s=slot(p.date,p.cro);s.qmsSales++;s.qmsSalesAmt+=p.amount||0;return true;});
    n+=consume(bus,'NONPURCHASE_CLOSED','croaudit',function(e){var p=e.payload||{};if(!p.cro||!p.date)return true;slot(p.date,p.cro).qmsNonPurch++;return true;});
    n+=consume(bus,'DSR_SUBMITTED','croaudit',function(e){var p=e.payload||{};if(!p.name||!p.date)return true;var s=slot(p.date,p.name);s.dsrSubmitted=true;if(p.score!=null)s.dsrScore=p.score;
      try{ var rr=L(dsrKey(p.date,p.name),null); if(rr){ var sc=0,sa=0; (rr.sales||[]).forEach(function(x){ sc++; sa+=Number(x.amount)||0; }); s.dsrSalesCount=sc; s.dsrSalesAmt=sa; s.dsrNonPurch=(rr.nonpurch||[]).length; } }catch(_e){}
      return true;});
    // Prune day-slots older than FEED_KEEP_DAYS. Explicit YYYY-MM-DD test so _note/_generatedAt survive.
    var fcut=cutoffIso(FEED_KEEP_DAYS), removed=0;
    Object.keys(feed).forEach(function(k){ if(/^\d{4}-\d{2}-\d{2}$/.test(k) && k<fcut){ delete feed[k]; removed++; } });
    if(n>0 || removed>0){   // write only when the feed actually changed (idle cycle = no write = no forced persist)
      feed._note='Auto-derived CRO audit inputs (grooming %, QMS sales/non-purchase, DSR submit/score). SM confirms in CRO Daily Audit.';
      feed._generatedAt=new Date().toISOString();
      S(CRO_FEED,feed);
    }
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

  /* ── LINK 6: WSC delivered case → Expense central ledger (service income) ──
     Consumes SERVICE_DELIVERED as exactly ONE gm_expenses income row (the shape Expense's own
     normEntry() re-normalises on read, so every renderer/total just works). Durable dedupe =
     ledger sourceRef 'wsc_<caseId>' — the SAME ref Expense's manual Sync tab uses, so a row
     posted by either path is seen as posted by the other, in either order, forever.
     Expense forbids new entries on a locked day (addEntry checks stmt.closed), so we honour it:
     file under the collection day; if locked, under today; if today is ALSO locked, leave the
     event unconsumed and retry next cycle (it posts on the next open day). */
  function consumeServiceIncomeToLedger(bus){
    var cur=L(EXP_LEDGER,null);
    if(cur!=null && !Array.isArray(cur)) return;            // unknown shape — never corrupt
    var arr=Array.isArray(cur)?cur:[];
    var have={}; arr.forEach(function(x){ if(x&&x.sourceRef) have[x.sourceRef]=1; });
    var stmts=L(EXP_STMT,null)||{}; if(typeof stmts!=='object') stmts={};
    var d=today(), added=0;
    consume(bus,'SERVICE_DELIVERED','expense',function(e){
      var p=e.payload||{}; if(!p.cid) return true;
      var ref='wsc_'+p.cid;
      if(have[ref]) return true;                            // already in the ledger (bridge OR manual Sync) — mark done
      var amt=Number(p.amount)||0; if(!(amt>0)) return true;
      var fd=String(p.date||'').slice(0,10)||d;
      if(stmts[fd]&&stmts[fd].closed) fd=d;
      if(stmts[fd]&&stmts[fd].closed) return false;         // today locked too → retry next cycle, do NOT consume
      var md=p.mode||'Cash';                                // counter default = Cash (same as Sync tab)
      if(md!=='Cash'&&md!=='UPI'&&md!=='Card'&&md!=='Bank') md=(/bank/i.test(md)?'Bank':/upi/i.test(md)?'UPI':/card/i.test(md)?'Card':'Cash');
      var desc='Service delivered '+p.cid+(p.cust?' — '+p.cust:'')+(p.brand?' ('+p.brand+(p.model?' '+p.model:'')+')':'')+((p.date&&fd!==String(p.date).slice(0,10))?' · collected '+String(p.date).slice(0,10):'');
      arr.push({id:'e_wsc_'+String(p.cid).replace(/[^A-Za-z0-9_-]/g,''),type:'income',date:fd,amount:amt,
        category:'Service Income',mode:md,vendor:'',firm:'',description:desc,
        notes:p.ref?('Pay ref: '+p.ref):'',billPhoto:null,source:'wsc',sourceRef:ref,void:false,
        createdAt:new Date().toISOString(),createdBy:'bridge',editLog:[]});
      have[ref]=1; added++; return true;
    });
    if(added){ S(EXP_LEDGER,arr); blog('WSC delivered → ledger income +'+added); }
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
      // Wave4: staff not grooming-checked today (active roster − leave − already-checked). Mirrors the grooming
      // module's grmEmployees()+grmTodayCounts() predicate so the module panel and this hub count agree.
      try{ var __em=L(EMP_MASTER,[])||[], __gg=L(GATE,{})||{}, __un=(__gg&&__gg.unavailable)||{};
        var __grecs=L(GROOM+d,[])||[], __done={}; if(Array.isArray(__grecs)) __grecs.forEach(function(r){ if(r&&r.name) __done[kk(r.name)]=1; });
        var __pend=0; if(Array.isArray(__em)) __em.forEach(function(e){ if(!e||!e.name||e.active===false) return; var k=kk(e.name); if(__un[k]&&__un[k].leave===true) return; if(!__done[k]) __pend++; });
        if(__pend) ex.push({sev:'med',area:'Grooming',msg:__pend+' staff not grooming-checked today',at:d});
      }catch(e){}
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
      // Stock not locked today
      try{ ['WLMHW','HEMW'].forEach(function(sc){ var sb=L('saagar_stock_'+skey(sc)+'_'+d,null);
        if(sb&&typeof sb==='object'&&!sb.closingLocked) ex.push({sev:'med',area:'Stock',msg:sc+' closing not locked today',at:d});
      }); }catch(e){}
      // P1-7: unverified theft TODAY — HIGH, actionable. Reads tsb.movements[*].theft + tsb.theftVerified
      // {by,at} (stamped by stock doLockClosing). closingLocked===true skips ⇒ pre-feature/locked days
      // exempt; theftVerified.by skips ⇒ already signed off; fires only after movements submit (no mid-entry
      // noise). TODAY ONLY — past-day theft accountability lives in the Stock module's Monthly Variance &
      // Shrinkage report (P1-6), the proper home for historical review; the hub is for act-today items, so
      // this item self-clears the moment the SM verifies & locks closing. (A past-day nag would be
      // un-actionable — the module makes past days read-only — and would wedge the EOD close-day wizard.)
      try{
        ['WLMHW','HEMW'].forEach(function(sc){
          var tsb=L('saagar_stock_'+skey(sc)+'_'+d,null);
          if(!tsb||typeof tsb!=='object'||!tsb.movements) return;
          if(tsb.closingLocked===true) return;
          if(tsb.theftVerified&&tsb.theftVerified.by) return;
          if(tsb.movementsSubmitted!==true) return;   // mid-entry today: no noise yet
          var ttu=0; Object.keys(tsb.movements).forEach(function(b){var m=tsb.movements[b]; var _t=m&&Number(m.theft); ttu+=isFinite(_t)?_t:0;});
          if(ttu>0) ex.push({sev:'high',area:'Stock',msg:sc+' theft '+ttu+' unit(s) today not SM-verified — verify & lock closing',at:d});
        });
      }catch(e){}
      // Cash statement today not closed / mismatch (read-only)
      try{ var stm=L(EXP_STMT,null); if(stm&&stm[d]){ var s=stm[d];
        if(!s.closed) ex.push({sev:'med',area:'Cash',msg:'Cash statement not closed today',at:d});
        if(s.mismatchReason) ex.push({sev:'high',area:'Cash',msg:'Cash mismatch: '+String(s.mismatchReason).slice(0,60),at:d});
      } }catch(e){}
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
              if(!c||String(c.outcome||'').toLowerCase()!=='purchase') return;   // same predicate as produce()
              var qd=String(c.exitTime||c.entryTime||c.walkInTime||'').slice(0,10);
              if(qd!==cd) return;
              if(c.paymentMode==='Mixed'){ qMixed++; return; }
              if(c.paymentMode!=='Cash') return;            // Card/UPI/missing-mode rows never count as cash
              var _qn=Number(c.purchaseAmount||c.amount); if(isFinite(_qn)) qCash+=_qn;   // same amount fallback as produce()
            });
            if(qMixed||!(qCash>0)) continue;                // split payment on the day → unknowable; zero-cash day → nothing to check
            // cIn MUST equal Expense computeDay(cd).cashIn. Expense normalises rows at read (getLedger→normEntry,
            // expense.html L478-490 / L511) so a legacy non-canonical row ('cash'/'Income'/full-ISO date) counts
            // in the user-visible statement; strict raw-field matching here would MISS it → bridge under-counts
            // → false "figures don't tally" flag. Mirror normEntry's type/mode/date canonicalisation so the
            // cross-check compares against exactly the cash total the SM sees.
            var cIn=0;
            ledq.forEach(function(x){
              if(!x||x.void) return;
              if(String(x.date||'').slice(0,10)!==cd) return;
              if(String(x.type||'expense').toLowerCase()!=='income') return;
              var _m=x.mode||x.paymentMode||'Cash';
              if(['Cash','UPI','Card','Bank'].indexOf(_m)<0) _m=/cash/i.test(_m)?'Cash':'x';   // normEntry L481
              if(_m!=='Cash') return;
              var _cn=Number(x.amount); if(isFinite(_cn)) cIn+=_cn;
            });
            if(qCash>cIn+CASH_TOL){
              var _inr=function(n){return '₹'+Math.round(n).toLocaleString('en-IN');};
              ex.push({sev:'med',area:'Cash',
                msg:'QMS cash sales '+_inr(qCash)+' vs statement cash income '+_inr(cIn)+(cd===d?'':' ('+cd+')')+" — figures don't tally; verify billing / statement entries",
                at:cd});
            }
          }
        }
      }catch(e){}
      // Missing vouchers (Expense ledger today, >2000, no photo) — read-only
      try{ var led=L(EXP_LEDGER,null); if(Array.isArray(led)){
        var vth=cfg().voucherThreshold;
        var mv=led.filter(function(x){return x&&!x.void&&(x.date||'')===d&&(x.type||'expense')!=='income'&&Number(x.amount)>vth&&!x.billPhoto;}).length;
        if(mv) ex.push({sev:'low',area:'Expense',msg:mv+' expense(s) >₹'+vth+' today without a bill photo',at:d});
      } }catch(e){}
      // Tax payable due (from our own feed)
      try{ var tp=L(TAXPAY,{})[ym(d)]; if(tp&&(tp.pf||tp.esic||tp.pt||tp.gstEstimate)) ex.push({sev:'low',area:'Tax',msg:'Statutory payable accruing this month (PF/ESIC/PT/GST) — see Tax',at:d}); }catch(e){}
      // Wave4: staff logged into DSR but not submitted, after the store closing time (cfg.dsrClosingTime, default
      // 20:30). Skips bridge-created QMS stubs + no-login placeholders; today-only so yesterday never false-fires.
      try{ var __close=cfg().dsrClosingTime;
        var __now=(function(){var t=new Date();return String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0');})();
        if(__now>=__close){ var __pending=[];
          for(var __i=0;__i<localStorage.length;__i++){ var __lk=localStorage.key(__i); var __m=__lk&&__lk.match(/^saagar_dsr_(\d{4}-\d{2}-\d{2})_(.+)$/);
            if(!__m||__m[1]!==d) continue; var __r=L(__lk,null); if(!__r||typeof __r!=='object') continue;
            if(__r._noRecord||__r._bridgeCreated) continue; if(__r.submitted===true) continue; if(!__r.loginTime||__r.loginTime==='—') continue;
            __pending.push(nm(__r.staffName||__m[2].replace(/_/g,' '))); }
          if(__pending.length) ex.push({sev:'high',area:'DSR',msg:__pending.length+' staff logged in but DSR not submitted (after '+__close+') — '+__pending.slice(0,4).join(', ')+(__pending.length>4?' +'+(__pending.length-4)+' more':''),at:d}); }
      }catch(e){}
      ex.sort(function(a,b){var o={high:0,med:1,low:2};return o[a.sev]-o[b.sev];});
      S(EXC,{date:d,items:ex,generatedAt:new Date().toISOString()});
    }catch(e){}
  }

  /* ── EMPLOYEE MASTER UNION (reconcile, not event) ──────────────────── */
  /* ONE-WAY: the Employee Master is the single source of truth (edited in
     Settings → People). The bridge no longer harvests module staff lists into
     it (that was leaking QMS demo CROs everywhere). It only PUSHES the master
     into QMS/DSR, and preserves every master field (gender, empId, dept…). */
  function reconcileEmployeeMaster(){
    try{
      var master=L(EMP_MASTER,[]); if(!Array.isArray(master))master=[];
      var by={};
      master.forEach(function(e){
        var n=(e&&e.name)||e; if(!n) return; var k=kk(n);
        var obj=(e&&typeof e==='object')?e:{};
        // NOTE: the Employee Master (Settings → People) is now the single source of truth for
        // creating employees, so we must NEVER silently drop a user-created record here. (The old
        // DEMO_STUBS rule deleted anyone named Rahul/Priya/Neha/Amit/Suresh with no extra fields —
        // it could vanish a real employee added as a bare first name. QMS still purges its OWN seeded
        // demo CROs by name+code in its load(), which is specific and safe.)
        by[k]=Object.assign({},obj,{name:nm(n),active:!(obj&&obj.active===false)});
      });
      var union=Object.keys(by).map(function(k){return by[k];}).sort(function(a,b){return a.name.localeCompare(b.name);});
      if(JSON.stringify(union)!==JSON.stringify(master)){ S(EMP_MASTER,union); blog('emp-master cleaned '+union.length); }
      // master → QMS roster: DO NOT write the QMS blob from here (bug bridge-01). QMS runs in an iframe and
      // saves its whole state wholesale, so a bridge write from the shell could clobber an in-flight QMS
      // save (lost-update race silently dropping a just-added customer / audit / allocation). QMS already
      // UNIONS the Employee Master into its own cros at load time (qms.html load() reads
      // saagar_employee_master_v1) — the same read-time-union pattern Stock uses for brands — so seeding
      // the roster from here is both redundant and unsafe. (The DSR list + saagar_cros writes below target
      // plain standalone keys, not an in-memory-wholesale-saved blob, so they carry no such race and stay.)
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
        /* Phase 1: do NOT push master brands into saagar_brands. Stock's getBrands() now UNIONS the
           brand master at read time (mapping store code→internal key), so writing here would risk
           replacing Stock's built-in DEFAULT_BRANDS (getBrands returns saagar_brands[store] wholesale
           when present). The harvest above still pulls any Stock-saved brands up into the master. */
      }catch(e){}
      // vendors: union master ↔ gm_vendors [{name}]
      try{ var mv=L(MK_VENDORS,[]); if(!Array.isArray(mv))mv=[];
        var gv=L('gm_vendors',[]); if(!Array.isArray(gv))gv=[];
        var mvKey={}; mv.forEach(function(v){ if(v&&v.name)mvKey[kk(v.name)]=1; }); var mvCh=false;
        gv.forEach(function(v){ var n=v&&(v.name||v); if(n&&!mvKey[kk(n)]){ mv.push({name:String(n),gstin:(v&&v.gstin)||''}); mvKey[kk(n)]=1; mvCh=true; } });
        if(mvCh) S(MK_VENDORS,mv);
        var gvKey={}; gv.forEach(function(v){var n=v&&(v.name||v); if(n)gvKey[kk(n)]=1;}); var gvCh=false;
        mv.forEach(function(v){ if(v&&v.name&&!gvKey[kk(v.name)]){ gv.push({name:v.name,gstin:v.gstin||''}); gvKey[kk(v.name)]=1; gvCh=true; } });
        if(gvCh){ S('gm_vendors',gv); blog('seeded vendors → Expense'); } }catch(e){}
      // customers: harvest QMS + WSC → master (one-way; customers are created in modules)
      try{ var mc=L(MK_CUSTOMERS,[]); if(!Array.isArray(mc))mc=[];
        var mcKey={}; mc.forEach(function(c){ if(c&&c.name)mcKey[kk(c.name)+'|'+(c.mobile||'')]=1; }); var mcCh=false;
        function addCust(n,mob){ if(!n)return; var k=kk(n)+'|'+(mob||''); if(!mcKey[k]){ mc.push({name:String(n),mobile:String(mob||'')}); mcKey[k]=1; mcCh=true; } }
        var q=L(QMS,null); if(q&&Array.isArray(q.customers)) q.customers.forEach(function(c){ if(c&&c.name)addCust(c.name,c.mobile); });
        var w=L(WSC,null); if(Array.isArray(w)) w.forEach(function(c){ if(c&&c.custName)addCust(c.custName,c.custMobile); });
        if(mcCh){ S(MK_CUSTOMERS,mc); blog('harvested customers → master'); } }catch(e){}
      /* Wave 3 — DERIVED customer identity index, mobile-keyed with a stable custId. Read-only rollup of the
         SAME QMS+Service sources (never mutates a module record). Mobile normalises to its last 10 digits;
         rows without a usable mobile stay module-local (unmatched). Feeds Customer 360 (Home search / repeat
         flag) and gives Udhaar receivables a stable customer key. Writes only on an actual change. */
      try{ var norm10=function(m){ var d=String(m||'').replace(/\D/g,''); return d.length>=10?d.slice(-10):''; };
        var cm=L(CUST_MASTER,null); if(!cm||typeof cm!=='object'||!cm.byMobile||typeof cm.byMobile!=='object') cm={version:1,byMobile:{}};
        var by=cm.byMobile, cmCh=false;
        function touchCust(name,mobile,src,extra){ var m10=norm10(mobile); if(!m10) return; var e=by[m10];
          if(!e){ e={custId:'c_'+m10,mobile:m10,names:[],sources:{}}; by[m10]=e; cmCh=true; }
          var nn=nm(name); if(nn){ var _lk=kk(nn); if(!e.names.some(function(x){return kk(x)===_lk;}) && e.names.length<6){ e.names.push(nn); cmCh=true; } }   /* bug bridge-04: dedup names case-insensitively so 'Ravi'/'RAVI' don't both fill the 6-name cap and crowd out a genuinely distinct name */
          if(!e.sources[src]){ e.sources[src]=true; cmCh=true; }
          /* P1-54: carry birthday/anniversary onto the master. FIRST-WINS (set only when absent): two records
             sharing a mobile with different dates would otherwise flip cmCh every 60s cycle and rewrite the
             master forever (verify-fix). A blank is never written and an existing date is never overwritten. */
          if(extra){ if(extra.dob && !e.dob){ e.dob=extra.dob; cmCh=true; } if(extra.anniv && !e.anniv){ e.anniv=extra.anniv; cmCh=true; } } }
        var q2=L(QMS,null); if(q2&&Array.isArray(q2.customers)) q2.customers.forEach(function(c){ if(c&&c.mobile) touchCust(c.name,c.mobile,'qms',{dob:c.dob,anniv:c.anniv}); });
        var w2=L(WSC,null); if(Array.isArray(w2)) w2.forEach(function(c){ if(c&&c.custMobile) touchCust(c.custName,c.custMobile,'service'); });
        if(cmCh){ cm.version=1; cm.updatedAt=new Date().toISOString(); S(CUST_MASTER,cm); blog('customer master: '+Object.keys(by).length+' mobiles'); } }catch(e){}
    }catch(e){}
  }

  /* ── ORGANISATION PUBLISHER (additive; never overwrites user data) ─── */
  function publishOrg(){
    var res={payroll:'skipped',taxFirmsAdded:0};
    try{
      var org=L(ORG_MASTER,null); if(!org||!Array.isArray(org.firms)) return res;
      var activeFirms=org.firms.filter(function(f){return f&&f.active!==false&&f.name;});
      if(!activeFirms.length) return res;
      /* C2 SINGLE-FIRM MODEL: Saagar Traders is the one firm; Titan World/Helios are its stores.
         firmName must never be ambiguous, so on a DRAFT run we overwrite a stale name; on an approved
         run we only fill a blank (never mutate an approved snapshot). */
      var SINGLE_FIRM=activeFirms.find(function(f){return f.code==='SAT';})||activeFirms[0];
      try{ var pb=L(PAYROLL,null);
        if(pb&&pb.meta){
          var runStatus=(pb.meta.run&&pb.meta.run.status)||'draft';
          var changed=false;
          if(runStatus==='draft'){
            if(nm(pb.meta.firmName)!==nm(SINGLE_FIRM.name)){ pb.meta.firmName=SINGLE_FIRM.name; pb.meta.firmCode=SINGLE_FIRM.code; changed=true; }
            if(!nm(pb.meta.firmAddr)&&nm(SINGLE_FIRM.address)){ pb.meta.firmAddr=SINGLE_FIRM.address; changed=true; }
          } else if(!nm(pb.meta.firmName)){ pb.meta.firmName=SINGLE_FIRM.name; changed=true; }
          if(changed){ S(PAYROLL,pb); res.payroll='set "'+SINGLE_FIRM.name+'"'; blog('org→payroll firm set'); }
          else res.payroll='kept (already "'+nm(pb.meta.firmName)+'")';
        } }catch(e){ res.payroll='error'; }
      // Tax: ensure the single firm exists (add by name); never delete a user-added firm.
      try{ var tx=L(TAX,null);
        if(tx&&typeof tx==='object'){
          if(!Array.isArray(tx.firms)) tx.firms=[];
          var have={}; tx.firms.forEach(function(f){ if(f&&f.name) have[kk(f.name)]=1; });
          if(!have[kk(SINGLE_FIRM.name)]){ tx.firms.push({id:'org_'+(SINGLE_FIRM.code||kk(SINGLE_FIRM.name)),name:SINGLE_FIRM.name,pan:SINGLE_FIRM.pan||'',gstin:SINGLE_FIRM.gstin||'',entityType:'',source:'org'}); res.taxFirmsAdded++; }
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
    _lastCycle=Date.now();   // rec #18: stamp every reconcile (all entry paths) for the freshness indicator
    _busDirty=false;
    var bus=busLoad();
    produce(bus);
    consumeQmsToDsr(bus);
    consumeQmsAllocatedToDsr(bus);
    consumeDsrPurchaseAck(bus);
    consumeDsrToStock(bus);
    consumeAttendanceFeed(bus);
    consumeCroAuditFeed(bus);
    consumeQmsServiceToWsc(bus);
    consumeServiceIncomeToLedger(bus);
    computeGate(bus);
    var pruned=busPrune(bus);
    if(_busDirty || pruned>0) busSave(bus);   // write the bus ONLY when it changed — an idle reconcile writes nothing (no forced whole-DB persist → no ANR)
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
        lastCycleAt:_lastCycle?new Date(_lastCycle).toISOString():null,
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
        '<span id="__saagarGateOpen" style="float:right;cursor:pointer;font-weight:700;padding:0 10px;text-decoration:underline">Open ▸</span>'+
        '<span id="__saagarGateX" style="float:right;cursor:pointer;font-weight:700;padding-left:12px">✕</span>';
      doc.body.appendChild(bar);
      /* Rec #6: "Open ▸" jumps to the module that clears the gate (grooming = the actionable fix).
         The bar is inside the iframe, so it posts to the shell, which calls navigateToModule. */
      var ob=doc.getElementById('__saagarGateOpen');
      if(ob) ob.addEventListener('click',function(){ try{ parent.postMessage({type:'ST_OPEN_MODULE',id:'grooming'},'*'); }catch(e){} });
      var xb=doc.getElementById('__saagarGateX');
      if(xb) xb.addEventListener('click',function(){ try{ bar.style.display='none'; }catch(e){} });
    }catch(e){}
  }
  function hookFrame(){
    var f=document.getElementById('moduleFrame'); if(!f||f.__saagarBridgeBound)return; f.__saagarBridgeBound=true;
    f.addEventListener('load',function(){ try{
      // Show the (cheap) gate banner from the already-computed gate state FIRST, so the
      // module is immediately usable.
      var doc=f.contentDocument||(f.contentWindow&&f.contentWindow.document);
      if(doc){
        // Match by the shell's module id (activeModuleId is a shell global; the bridge runs in the
        // same page). Title regex kept only as fallback — DSR's title is "CRO Login", so the old
        // /daily staff register/ test never matched and the banner never showed in DSR.
        var mid=''; try{ mid=activeModuleId||''; }catch(e){}
        var t=(doc.title||'')+' '+((document.getElementById('activeTitle')||{}).textContent||'');
        if(mid==='qms'||/queue management|qms/i.test(t)) gateBanner(doc,'Queue Management');
        else if(mid==='dsr'||/daily staff register/i.test(t)) gateBanner(doc,'Daily Staff Register');
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
