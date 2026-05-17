/* ═══════════════════════════════════════════════════════════════════════════
   SAAGAR CONTROL CENTRE — CROSS-MODULE INTEGRATION BRIDGE
   ───────────────────────────────────────────────────────────────────────────
   Implements the 5 "hard links" from the 9-module architecture, at the
   localStorage layer the shell fully controls (all modules share one origin
   inside the WebView). Runs in the shell; reconciles continuously and injects
   a grooming-gate banner into QMS / DSR when they are open.

   Honest scope:
     • Employee Master unification ....... ENFORCED (single union master)
     • Grooming clearance gate ........... ENFORCED (visible block banner +
                                            shared gate-status key)
     • QMS → DSR auto-fill ............... ENFORCED (deduped by lead id;
                                            CRO never re-keys a sale)
     • DSR → Stock roll-up .............. BEST-EFFORT FEED (non-destructive
                                            meta; never touches SM-locked rows)
     • DSR/Leave → Payroll .............. BEST-EFFORT FEED (attendance feed key;
                                            Payroll→Expense/Tax already done by
                                            Expense Manager v2 — not duplicated)
   Full transactional enforcement is the PHP/MySQL rebuild's job; this is the
   strongest correct behaviour possible in an offline single-device app.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var EMP_MASTER   = 'saagar_employee_master_v1';
  var GATE_STATUS  = 'saagar_gate_status';
  var Q2D_TRACK    = 'saagar_bridge_qms2dsr';
  var ATT_FEED     = 'saagar_payroll_attendance_feed';
  var LOGK         = 'saagar_bridge_log';
  var GROOM_PREFIX = 'saagar_grooming_';
  var QMS_KEY      = 'retail_queue_management_v1';
  var DSR_PREFIX   = 'saagar_dsr_';
  var DSR_STAFF    = 'saagar_dsr_staff';
  var FAIL_PCT     = 60;          // < 60 % grooming = blocked from floor
  var TICK_MS      = 60000;

  function today(){ var d=new Date(); function p(n){return(n<10?'0':'')+n;} return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
  function ym(s){ return (s||today()).slice(0,7); }
  function L(k,fb){ try{ var v=localStorage.getItem(k); return v?JSON.parse(v):fb; }catch(e){ return fb; } }
  function S(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); return true; }catch(e){ return false; } }
  function norm(n){ return String(n||'').trim(); }
  function key(n){ return norm(n).toLowerCase(); }
  function blog(m){ try{ var a=L(LOGK,[]); a.unshift({at:new Date().toISOString(),m:m}); if(a.length>200)a=a.slice(0,200); S(LOGK,a);}catch(e){} }

  /* ── 1 ── EMPLOYEE MASTER UNIFICATION ───────────────────────────────────
     Union every module's staff list into one canonical master, then push the
     canonical names back into the modules that keep their own list (QMS cros,
     DSR staff). Additive only — never deletes a module-local name. */
  function reconcileEmployeeMaster(){
    try{
      var master=L(EMP_MASTER,[]); if(!Array.isArray(master)) master=[];
      var byKey={}; master.forEach(function(e){ var nm=(e&&e.name)||e; if(nm) byKey[key(nm)]={name:norm(nm),roles:(e&&e.roles)||[]}; });

      // collect from QMS cros
      var qms=L(QMS_KEY,null);
      if(qms&&Array.isArray(qms.cros)) qms.cros.forEach(function(c){ if(c&&c.name&&!byKey[key(c.name)]) byKey[key(c.name)]={name:norm(c.name),roles:['CRO']}; });
      // collect from DSR staff list
      var ds=L(DSR_STAFF,null);
      if(Array.isArray(ds)) ds.forEach(function(n){ if(n&&!byKey[key(n)]) byKey[key(n)]={name:norm(n),roles:['CRO']}; });
      // collect from today's grooming + cro audit + leave employees
      try{ (L(GROOM_PREFIX+today(),[])||[]).forEach(function(r){ if(r&&r.name&&!byKey[key(r.name)]) byKey[key(r.name)]={name:norm(r.name),roles:['CRO']}; }); }catch(e){}
      try{ var lv=L('leavedesk_v3',null); if(lv&&Array.isArray(lv.employees)) lv.employees.forEach(function(e){ var nm=e&&(e.name||e.employeeId); if(nm&&!byKey[key(nm)]) byKey[key(nm)]={name:norm(nm),roles:[]}; }); }catch(e){}

      var union=Object.keys(byKey).map(function(k){ return byKey[k]; }).sort(function(a,b){ return a.name.localeCompare(b.name); });
      if(JSON.stringify(union)!==JSON.stringify(master)){ S(EMP_MASTER,union); blog('employee-master union → '+union.length+' staff'); }

      // push back into QMS cros (additive)
      if(qms&&Array.isArray(qms.cros)){
        var have={}; qms.cros.forEach(function(c){ if(c&&c.name) have[key(c.name)]=1; });
        var added=0;
        union.forEach(function(u){ if(!have[key(u.name)]){ qms.cros.push({id:'emp_'+key(u.name).replace(/[^a-z0-9]/g,''),name:u.name,active:true}); added++; } });
        if(added){ S(QMS_KEY,qms); blog('seeded '+added+' staff into QMS roster'); }
      }
      // push back into DSR staff list (additive)
      var dsArr=Array.isArray(ds)?ds.slice():[];
      var dHave={}; dsArr.forEach(function(n){ dHave[key(n)]=1; });
      var dAdd=0; union.forEach(function(u){ if(!dHave[key(u.name)]){ dsArr.push(u.name); dAdd++; } });
      if(dAdd){ S(DSR_STAFF,dsArr); blog('seeded '+dAdd+' staff into DSR list'); }
      return union;
    }catch(e){ return []; }
  }

  /* ── 2 ── GROOMING CLEARANCE GATE ───────────────────────────────────────
     v3 grooming writes saagar_grooming_<date> = [{name,gender,pct,...}].
     blocked = audited today with pct < FAIL_PCT. Publish a shared status key
     and show a hard banner inside QMS / DSR. */
  function computeGate(){
    var d=today(), recs=L(GROOM_PREFIX+d,[]); if(!Array.isArray(recs)) recs=[];
    var blocked=[], cleared=[];
    recs.forEach(function(r){
      if(!r||!r.name) return;
      var p=Number(r.pct); if(isNaN(p)) p=0;
      if(p<FAIL_PCT) blocked.push({name:norm(r.name),pct:Math.round(p)});
      else cleared.push(norm(r.name));
    });
    var status={date:d,blocked:blocked,cleared:cleared,auditedCount:recs.length,generatedAt:new Date().toISOString()};
    var prev=L(GATE_STATUS,null);
    if(!prev||JSON.stringify(prev.blocked)!==JSON.stringify(blocked)||prev.date!==d){ S(GATE_STATUS,status); if(blocked.length) blog('grooming gate: '+blocked.length+' blocked'); }
    return status;
  }
  function injectGateBanner(doc, moduleName){
    try{
      if(!doc||!doc.body) return;
      var ex=doc.getElementById('__saagarGate'); if(ex) ex.parentNode.removeChild(ex);
      var g=computeGate();
      if(!g.blocked.length) return;                       // nothing to warn
      var names=g.blocked.map(function(b){return b.name+' ('+b.pct+'%)';}).join(', ');
      var bar=doc.createElement('div');
      bar.id='__saagarGate';
      bar.setAttribute('style','position:fixed;left:0;right:0;bottom:0;z-index:2147483646;'+
        'background:#b91c1c;color:#fff;font-family:Arial,Helvetica,sans-serif;font-size:13px;'+
        'padding:10px 14px;box-shadow:0 -4px 14px rgba(0,0,0,.25);line-height:1.4');
      bar.innerHTML='⛔ <b>Grooming gate ('+moduleName+')</b> — not cleared for the floor today: <b>'+
        names+'</b>. Do not assign / allow these CROs until re-checked &amp; passed in Grooming.'+
        '<span style="float:right;cursor:pointer;font-weight:700;padding-left:12px" '+
        'onclick="this.parentNode.style.display=\'none\'">✕</span>';
      doc.body.appendChild(bar);
    }catch(e){}
  }

  /* ── 3 ── QMS → DSR AUTO-FILL ───────────────────────────────────────────
     A closed lead in QMS becomes a DSR sales / non-purchase row for the
     assigned CRO, deduped by lead id. CRO confirms in DSR; never re-keys. */
  function dsrKey(date,name){ return DSR_PREFIX+date+'_'+norm(name).replace(/\s+/g,'_'); }
  function ensureDsrRecord(date,name){
    var k=dsrKey(date,name), r=L(k,null);
    if(!r||typeof r!=='object'){
      r={date:date,staffName:norm(name),role:'CRO',loginTime:'',submitTime:'',submitted:false,
         audit:{},opening:{},closing:{},inout:[],sales:[],nonpurch:[],tasks:{},marketing:{},cleaning:{},
         _bridgeCreated:true};
    }
    if(!Array.isArray(r.sales)) r.sales=[];
    if(!Array.isArray(r.nonpurch)) r.nonpurch=[];
    return {k:k,r:r};
  }
  function reconcileQmsToDsr(){
    try{
      var qms=L(QMS_KEY,null); if(!qms||!Array.isArray(qms.customers)) return 0;
      var crosById={}; (qms.cros||[]).forEach(function(c){ if(c) crosById[c.id]=c.name; });
      var track=L(Q2D_TRACK,{}); if(typeof track!=='object'||!track) track={};
      var n=0;
      qms.customers.forEach(function(c){
        if(!c) return;
        var cid=c.id||c.mobile; if(!cid||track[cid]) return;
        var out=(c.outcome||'').toLowerCase();
        var closed=(c.status==='closed')||out;
        if(!closed||!out) return;
        var when=(c.exitTime||c.walkInTime||'')+''; var dt=when?when.slice(0,10):today();
        var croName=crosById[c.allocatedCroId]||crosById[c.croId]||c.allocatedCroName||c.croName||'';
        if(!croName) return;
        var ed=ensureDsrRecord(dt,croName);
        if(out==='purchase'){
          ed.r.sales.push({amount:Number(c.amount)||0,billNo:c.billNo||'',customer:c.name||'',
            mobile:c.mobile||'',time:when.slice(11,16)||'',source:'qms',sourceRef:cid,_confirmed:false});
        } else if(out==='service'){
          ed.r.sales.push({amount:Number(c.amount)||0,billNo:c.jobCard||c.billNo||'',customer:c.name||'',
            type:'service',mobile:c.mobile||'',source:'qms',sourceRef:cid,_confirmed:false});
        } else { // non-purchase / lost
          ed.r.nonpurch.push({customer:c.name||'',mobile:c.mobile||'',
            reason:c.lostReason||c.reason||'non-purchase',source:'qms',sourceRef:cid,_confirmed:false});
        }
        S(ed.k,ed.r); track[cid]={dsr:ed.k,at:new Date().toISOString(),cro:croName,outcome:out}; n++;
      });
      if(n){ S(Q2D_TRACK,track); blog('QMS→DSR auto-filled '+n+' lead(s)'); }
      return n;
    }catch(e){ return 0; }
  }

  /* ── 4 ── DSR → STOCK ROLL-UP (non-destructive feed) ────────────────────
     Aggregate DSR opening/closing counts per store/day into a clearly
     labelled _dsrRollup meta on saagar_stock_<store>_<date>. Never alters
     brand rows or SM lock flags. */
  function reconcileDsrToStock(){
    try{
      var d=today(), stores={WLMHW:{open:0,close:0,cros:[]},HEMW:{open:0,close:0,cros:[]}};
      for(var i=0;i<localStorage.length;i++){
        var lk=localStorage.key(i);
        if(!lk||lk.indexOf(DSR_PREFIX+d+'_')!==0) continue;
        var rec=L(lk,null); if(!rec) continue;
        var st=(rec.store||rec.storeCode||'').toUpperCase();
        var bucket = stores[st] || stores.WLMHW;       // default to main store
        function sumObj(o){ var t=0; if(o&&typeof o==='object') Object.keys(o).forEach(function(kk){ var v=Number(o[kk]&&(o[kk].counted||o[kk].physical||o[kk].qty)||o[kk]); if(!isNaN(v)) t+=v; }); return t; }
        bucket.open += sumObj(rec.opening); bucket.close += sumObj(rec.closing);
        if(rec.staffName) bucket.cros.push(rec.staffName);
      }
      ['WLMHW','HEMW'].forEach(function(sc){
        var sk='saagar_stock_'+sc+'_'+d, sb=L(sk,null);
        var roll={openingTotal:stores[sc].open,closingTotal:stores[sc].close,cros:stores[sc].cros,
                  source:'dsr',note:'Auto roll-up from Daily Staff Register — informational; SM count/lock unaffected',at:new Date().toISOString()};
        if(stores[sc].cros.length){
          if(!sb||typeof sb!=='object') sb={};
          sb._dsrRollup=roll;            // additive meta only — never touches brand rows or *Locked flags
          S(sk,sb);
        }
      });
    }catch(e){}
  }

  /* ── 5 ── DSR / LEAVE → PAYROLL (attendance feed) ───────────────────────
     Build a month attendance feed Payroll can consume. Payroll → Expense/Tax
     is already handled by Expense Manager v2 (untouched) — not duplicated. */
  function reconcileAttendanceFeed(){
    try{
      var m=ym(today()), feed=L(ATT_FEED,{}); if(typeof feed!=='object'||!feed) feed={};
      var month=feed[m]||{};
      // DSR present days
      for(var i=0;i<localStorage.length;i++){
        var lk=localStorage.key(i);
        var mm=lk&&lk.match(/^saagar_dsr_(\d{4}-\d{2}-\d{2})_(.+)$/);
        if(!mm||mm[1].slice(0,7)!==m) continue;
        var rec=L(lk,null); if(!rec||!rec.staffName) continue;
        var nm=norm(rec.staffName), o=month[nm]||{present:0,absent:0,half:0,leave:0,dsrDays:0};
        o.dsrDays++; if(rec.submitted) o.present = (o.present||0); o.present = (o.present||0)+1;
        month[nm]=o;
      }
      // Leave days
      try{ var lv=L('leavedesk_v3',null);
        if(lv&&lv.leaves){ Object.keys(lv.leaves).forEach(function(dk){
          if(dk.slice(0,7)!==m) return;
          (lv.leaves[dk]||[]).forEach(function(l){
            var nm=norm(l.staffName||l.empId||''); if(!nm) return;
            var o=month[nm]||{present:0,absent:0,half:0,leave:0,dsrDays:0};
            var t=(l.type||'full_day');
            if(t==='full_day') o.leave=(o.leave||0)+1; else o.half=(o.half||0)+1;
            month[nm]=o;
          });
        }); }
      }catch(e){}
      feed[m]=month; feed._generatedAt=new Date().toISOString(); feed._note='DSR present-days + LeaveDesk leave-days. Payroll maker reconciles before lock.';
      S(ATT_FEED,feed);
    }catch(e){}
  }

  /* ── ORCHESTRATION ──────────────────────────────────────────────────── */
  function reconcileAll(){
    reconcileEmployeeMaster();
    computeGate();
    reconcileQmsToDsr();
    reconcileDsrToStock();
    reconcileAttendanceFeed();
  }

  window.SaagarBridge = {
    runNow: function(){ reconcileAll(); return this.status(); },
    status: function(){
      return { employeeMaster:(L(EMP_MASTER,[])||[]).length,
               gate:L(GATE_STATUS,{blocked:[]}),
               qms2dsrLinked:Object.keys(L(Q2D_TRACK,{})||{}).length,
               attendanceMonths:Object.keys(L(ATT_FEED,{})||{}).filter(function(k){return k.charAt(0)!=='_';}),
               recentLog:(L(LOGK,[])||[]).slice(0,10) };
    }
  };

  /* Hook the module iframe: on every module open, reconcile and, for QMS/DSR,
     drop the grooming-gate banner into the module. */
  function hookFrame(){
    var f=document.getElementById('moduleFrame');
    if(!f||f.__saagarBridgeBound) return;
    f.__saagarBridgeBound=true;
    f.addEventListener('load',function(){
      try{
        reconcileAll();
        var doc=f.contentDocument||(f.contentWindow&&f.contentWindow.document);
        if(!doc) return;
        var t=(doc.title||'')+' '+((document.getElementById('activeTitle')||{}).textContent||'');
        if(/queue management|qms/i.test(t)) injectGateBanner(doc,'Queue Management');
        else if(/daily staff register/i.test(t)) injectGateBanner(doc,'Daily Staff Register');
      }catch(e){}
    });
  }

  function init(){
    reconcileAll();
    hookFrame();
    var tries=0, iv=setInterval(function(){ hookFrame(); if(++tries>20) clearInterval(iv); },500);
    setInterval(reconcileAll, TICK_MS);
    window.addEventListener('storage', function(){ reconcileAll(); });
    blog('integration bridge ready');
    console.log('[integration-bridge] ready · 5 cross-module links active');
  }
  if(document.readyState==='complete'||document.readyState==='interactive') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
