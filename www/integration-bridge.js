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
  var FAIL_PCT=60, TICK=60000, BUS_CAP=2000;

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
    var d=today(), blocked=[], cleared=[], seen={};
    bus.forEach(function(e){
      if(e.type==='GROOMING_RESULT' && e.payload && e.payload.date===d){
        var p=e.payload; if(p.pct<FAIL_PCT){ blocked.push({name:p.name,why:'grooming '+Math.round(p.pct)+'%'}); seen[kk(p.name)]=1; }
        else cleared.push(p.name);
      }
    });
    bus.forEach(function(e){
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
    feed[m]=month; feed._generatedAt=new Date().toISOString();
    feed._note='DSR present-days + SM scores + LeaveDesk leave-days. Payroll maker reconciles before lock.';
    S(ATT,feed);
  }

  /* ── EMPLOYEE MASTER UNION (reconcile, not event) ──────────────────── */
  function reconcileEmployeeMaster(){
    try{
      var master=L(EMP_MASTER,[]); if(!Array.isArray(master))master=[];
      var by={}; master.forEach(function(e){var n=(e&&e.name)||e; if(n)by[kk(n)]={name:nm(n),roles:(e&&e.roles)||[],active:!(e&&e.active===false)};});
      var q=L(QMS,null); if(q&&Array.isArray(q.cros)) q.cros.forEach(function(c){if(c&&c.name&&!by[kk(c.name)])by[kk(c.name)]={name:nm(c.name),roles:['CRO'],active:true};});
      var ds=L(DSR_STAFF,null); if(Array.isArray(ds)) ds.forEach(function(n){if(n&&!by[kk(n)])by[kk(n)]={name:nm(n),roles:['CRO'],active:true};});
      try{(L(GROOM+today(),[])||[]).forEach(function(r){if(r&&r.name&&!by[kk(r.name)])by[kk(r.name)]={name:nm(r.name),roles:['CRO'],active:true};});}catch(e){}
      try{var lv=L(LEAVE,null);if(lv&&Array.isArray(lv.employees))lv.employees.forEach(function(e){var n=e&&(e.name||e.employeeId);if(n&&!by[kk(n)])by[kk(n)]={name:nm(n),roles:[],active:true};});}catch(e){}
      var union=Object.keys(by).map(function(k){return by[k];}).sort(function(a,b){return a.name.localeCompare(b.name);});
      if(JSON.stringify(union)!==JSON.stringify(master)){ S(EMP_MASTER,union); blog('emp-master union '+union.length); }
      if(q&&Array.isArray(q.cros)){var h={};q.cros.forEach(function(c){if(c&&c.name)h[kk(c.name)]=1;});var add=0;
        union.forEach(function(u){if(!h[kk(u.name)]){q.cros.push({id:'emp_'+kk(u.name).replace(/[^a-z0-9]/g,''),name:u.name,active:true});add++;}});
        if(add){S(QMS,q);blog('seeded '+add+' → QMS roster');}}
      var da=Array.isArray(ds)?ds.slice():[],dh={};da.forEach(function(n){dh[kk(n)]=1;});var dadd=0;
      union.forEach(function(u){if(!dh[kk(u.name)]){da.push(u.name);dadd++;}});
      if(dadd){S(DSR_STAFF,da);blog('seeded '+dadd+' → DSR list');}
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
  function cycle(){
    var bus=busLoad();
    produce(bus);
    consumeQmsToDsr(bus);
    consumeDsrToStock(bus);
    consumeAttendanceFeed(bus);
    computeGate(bus);
    busSave(bus);
    reconcileEmployeeMaster();
    publishOrg();
  }

  window.SaagarBridge={
    runNow:function(){cycle();return this.status();},
    publishOrg:function(){var r=publishOrg();blog('manual org publish');return r;},
    bus:function(){return busLoad();},
    events:function(type){var b=busLoad();return type?b.filter(function(e){return e.type===type;}):b;},
    status:function(){var b=busLoad();var byType={};b.forEach(function(e){byType[e.type]=(byType[e.type]||0)+1;});
      return {busEvents:b.length,byType:byType,employeeMaster:(L(EMP_MASTER,[])||[]).length,
        gate:L(GATE,{blocked:[]}),qms2dsrLinked:Object.keys(L(Q2D,{})||{}).length,
        org:!!L(ORG_MASTER,null),recentLog:(L(LOGK,[])||[]).slice(0,12)};}
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
    f.addEventListener('load',function(){ try{ cycle();
      var doc=f.contentDocument||(f.contentWindow&&f.contentWindow.document); if(!doc)return;
      var t=(doc.title||'')+' '+((document.getElementById('activeTitle')||{}).textContent||'');
      if(/queue management|qms/i.test(t)) gateBanner(doc,'Queue Management');
      else if(/daily staff register/i.test(t)) gateBanner(doc,'Daily Staff Register');
    }catch(e){} });
  }
  function init(){
    cycle(); hookFrame();
    var n=0,iv=setInterval(function(){hookFrame();if(++n>20)clearInterval(iv);},500);
    setInterval(cycle,TICK);
    window.addEventListener('storage',function(){cycle();});
    blog('integration bridge v2 (event bus) ready');
    console.log('[integration-bridge] event-bus ready');
  }
  if(document.readyState==='complete'||document.readyState==='interactive') init();
  else document.addEventListener('DOMContentLoaded',init);
})();
