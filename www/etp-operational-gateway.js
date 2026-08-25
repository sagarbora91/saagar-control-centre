/* V6 ETP: pure, narrow E3/E4 presentation gateway over injected operational services. */
(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SaagarEtpOperationalGateway=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var VERSION='ETP_OPERATIONAL_GATEWAY_V1',BAD={sourceFacts:1,rows:1,rawRows:1,workbook:1,customer:1,customerName:1,customerMobile:1,phone:1,email:1,address:1,aadhaar:1,pan:1};
  function freeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.keys(v).forEach(function(k){freeze(v[k]);});Object.freeze(v);}return v;}
  function rec(v){return!!v&&typeof v==='object'&&!Array.isArray(v);}
  function fail(code){return freeze({ok:false,code:code});}
  function safeCode(v,fallback){return typeof v==='string'&&/^[A-Z][A-Z0-9_]{2,63}$/.test(v)?v:fallback;}
  function scope(v){var m=typeof v==='string'&&/^(WLMHW|HEMW)\|([0-9]{4}-[0-9]{2})\|(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(v);return m&&m[3]<=m[4]?{scopeKey:v,storeCode:m[1],financialYear:m[2],start:m[3],end:m[4]}:null;}
  function binding(v,s){return rec(v)&&v.scopeKey===s.scopeKey&&/^etp_[a-f0-9]{32}$/.test(v.generationId||'')&&/^[A-Za-z0-9][A-Za-z0-9._:-]{2,95}$/.test(v.receiptId||'')?{scopeKey:v.scopeKey,generationId:v.generationId,receiptId:v.receiptId}:null;}
  function clean(v){if(Array.isArray(v))return freeze(v.map(clean));if(rec(v)){var out={};Object.keys(v).sort().forEach(function(k){if(!BAD[k]&&k!=='operationalStore'&&k!=='store'&&k!=='engine'&&k!=='foundation')out[k]=clean(v[k]);});return freeze(out);}return v;}
  function result(v,fallback){if(!v||v.ok!==true)return fail(safeCode(v&&v.code,fallback));return clean(v);}
  function create(d){
    if(!rec(d)||!d.foundation||!d.operationalStore||!d.adapters||typeof d.adapters.createE3!=='function'||typeof d.adapters.createE4!=='function'||!d.e3Orchestrator||typeof d.e3Orchestrator.create!=='function'||!d.e4Orchestrator||typeof d.e4Orchestrator.create!=='function'||!d.e3Engine||!d.e4Engine||!d.verifiedFacade||typeof d.verifiedFacade.readE3!=='function'||typeof d.authorityProvider!=='function'||typeof d.clock!=='function')return fail('ETP_GATEWAY_DEPENDENCY_UNAVAILABLE');
    function authority(domain,storeCode){var a;try{a=d.authorityProvider(domain,storeCode);}catch(_){return null;}return a&&a.ok===true&&a.authority&&a.authority.domain===domain&&a.authority.stores.indexOf(storeCode)>=0?a:null;}
    function fence(s,b){return d.operationalStore.canReadVerifiedScope(s.scopeKey,{source:'ETP_VERIFIED',scopeKey:s.scopeKey,generationId:b.generationId,receiptId:b.receiptId})===true;}
    function e3(request){
      var s=rec(request)&&scope(request.scopeKey),b=s&&binding(request.binding,s),a=s&&authority('E3',s.storeCode);if(!s||!b)return fail('E3_GATEWAY_SCOPE_INVALID');if(!a)return fail('E3_GATEWAY_AUTHORITY_UNAVAILABLE');
      var adapted=d.adapters.createE3({operationalStore:d.operationalStore,scopeKey:s.scopeKey,now:d.clock});if(!adapted||adapted.ok!==true)return fail('E3_GATEWAY_STORE_UNAVAILABLE');
      var made=d.e3Orchestrator.create({engine:d.e3Engine,foundation:d.foundation,operationalStore:adapted.adapter,readVerified:function(q){if(!fence(s,b))throw new Error('FENCED');return d.verifiedFacade.readE3(q);},authority:a});return made&&made.ok===true?{s:s,b:b,o:made.orchestrator}:null;
    }
    function e3call(name,request,args,needsBinding){var c=e3(request);if(!c||c.ok===false)return Promise.resolve(c||fail('E3_GATEWAY_UNAVAILABLE'));if(needsBinding&& !fence(c.s,c.b))return Promise.resolve(fail('E3_RESTORE_REIMPORT_REQUIRED'));var day={storeCode:c.s.storeCode,businessDate:request.businessDate};try{return Promise.resolve(c.o[name].apply(c.o,[day].concat(args||[]))).then(function(x){return result(x,'E3_OPERATION_FAILED');},function(){return fail('E3_OPERATION_FAILED');});}catch(_){return Promise.resolve(fail('E3_OPERATION_FAILED'));}}
    function actor(r){return {actorId:r.actorId,actorRole:r.actorRole,at:r.at,reauthenticatedAt:r.reauthenticatedAt===undefined?null:r.reauthenticatedAt,reason:r.reason===undefined?null:r.reason};}
    var E3=freeze({
      load:function(r){return e3call('load',r,[],false);},open:function(r){return e3call('open',r,[],false);},declare:function(r){return e3call('declare',r,[actor(r),r.declaration],false);},close:function(r){return e3call('close',r,[actor(r)],false);},
      importVerified:function(r){return e3call('importVerified',r,[actor(r),r.binding],true);},reconcile:function(r){return e3call('reconcile',r,[actor(r)],true);},state:function(r){if(['IMPORTED','RECONCILED','VARIANCE'].indexOf(r.to)<0)return Promise.resolve(fail('E3_STATE_INVALID'));return e3call(r.to==='IMPORTED'?'markImported':'markReconciled',r,r.to==='IMPORTED'?[actor(r)]:[actor(r),r.to],true);},
      correct:function(r){return e3call('correct',r,[actor(r),r.correction],true);},dispose:function(r){return e3call('dispose',r,[actor(r),r.disposition],true);},lock:function(r){return e3call('lock',r,[actor(r)],true);},restatement:function(r){return e3call('startRestatementCycle',r,[actor(r),r.nextBinding],true);},backup:function(r){return e3call('createPortableBackup',r,[r.createdAt],false);}
    });
    function e4(request){var s=rec(request)&&scope(request.scopeKey),b=s&&binding(request.binding,s),a=s&&authority('E4',s.storeCode);if(!s||!b)return fail('E4_GATEWAY_SCOPE_INVALID');if(!a)return fail('E4_GATEWAY_AUTHORITY_UNAVAILABLE');if(!fence(s,b))return fail('E4_RESTORE_REIMPORT_REQUIRED');var adapted=d.adapters.createE4({operationalStore:d.operationalStore,scopeKey:s.scopeKey,now:d.clock});if(!adapted||adapted.ok!==true)return fail('E4_GATEWAY_STORE_UNAVAILABLE');try{return {s:s,b:b,o:d.e4Orchestrator.create({planning:d.e4Engine,foundation:d.foundation,store:adapted.adapter}),authority:a};}catch(_){return fail('E4_GATEWAY_UNAVAILABLE');}}
    function e4call(name,r){var c=e4(r);if(!c||c.ok===false)return c||fail('E4_GATEWAY_UNAVAILABLE');var request={};Object.keys(r).forEach(function(k){if(k!=='activeAuthority')request[k]=r[k];});request.binding={source:'ETP_VERIFIED',scopeKey:c.b.scopeKey,generationId:c.b.generationId,receiptId:c.b.receiptId};request.activeAuthority=c.authority;try{return result(c.o[name](request),'E4_OPERATION_FAILED');}catch(_){return fail('E4_OPERATION_FAILED');}}
    var E4=freeze({readiness:function(r){return e4call('readiness',r);},intake:function(r){return e4call('intakeSources',r);},publish:function(r){return e4call('publish',r);},revise:function(r){return e4call('revise',r);},reallocate:function(r){return e4call('reallocate',r);},pace:function(r){return e4call('pace',r);}});
    return freeze({ok:true,gateway:freeze({VERSION:VERSION,E3:E3,E4:E4})});
  }
  return freeze({VERSION:VERSION,create:create});
});
