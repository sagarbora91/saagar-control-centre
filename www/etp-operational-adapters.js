/* V6 ETP: dependency-injected adapters from orchestrators to the operational repository. */
(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SaagarEtpOperationalAdapters=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var VERSION='ETP_OPERATIONAL_ADAPTERS_V1';
  function freeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.keys(v).forEach(function(k){freeze(v[k]);});Object.freeze(v);}return v;}
  function clone(v){return JSON.parse(JSON.stringify(v));}
  function rec(v){return!!v&&typeof v==='object'&&!Array.isArray(v);}
  function exact(v,keys){return rec(v)&&Object.keys(v).sort().join('|')===keys.slice().sort().join('|');}
  function fail(code){return freeze({ok:false,code:code});}
  function scope(v){var m=typeof v==='string'&&/^(WLMHW|HEMW)\|([0-9]{4}-[0-9]{2})\|(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(v);return m&&m[3]<=m[4]?{scopeKey:v,storeCode:m[1],financialYear:m[2]}:null;}
  function id(v){return typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{2,95}$/.test(v)?v:'';}
  function repository(v){return v&&typeof v.put==='function'&&typeof v.get==='function'&&typeof v.list==='function'&&typeof v.canReadVerifiedScope==='function'?v:null;}
  function put(repo,domain,s,overlayId,payload,at){var query={domain:domain,storeCode:s.storeCode,financialYear:s.financialYear,scopeKey:s.scopeKey,overlayId:overlayId},prior=repo.get(query);if(!prior||prior.ok!==true)return fail('ETP_ADAPTER_STORE_UNAVAILABLE');var out=repo.put({domain:domain,storeCode:s.storeCode,financialYear:s.financialYear,scopeKey:s.scopeKey,overlayId:overlayId,updatedAt:at,payload:payload},prior.revision);return out&&out.ok===true?out:fail(out&&out.code==='ETP_STORE_REVISION_CONFLICT'?'ETP_ADAPTER_CONCURRENCY_CONFLICT':'ETP_ADAPTER_WRITE_FAILED');}
  function createE3(options){
    if(!exact(options,['operationalStore','scopeKey','now'])||!repository(options.operationalStore)||!scope(options.scopeKey)||typeof options.now!=='function')return fail('ETP_E3_ADAPTER_INVALID');var repo=options.operationalStore,s=scope(options.scopeKey);
    function parseKey(key){var m=/^E3\|(WLMHW|HEMW)\|(\d{4}-\d{2}-\d{2})$/.exec(key||'');return m&&m[1]===s.storeCode&&m[2]>=s.scopeKey.slice(-22,-12)&&m[2]<=s.scopeKey.slice(-10)?{key:key,date:m[2]}:null;}
    function query(parsed){return {domain:'E3',storeCode:s.storeCode,financialYear:s.financialYear,scopeKey:s.scopeKey,overlayId:'E3-'+parsed.date};}
    async function load(key){var p=parseKey(key);if(!p)throw new Error('ETP_E3_ADAPTER_SCOPE_INVALID');var out=repo.get(query(p));if(!out||out.ok!==true)throw new Error('ETP_E3_ADAPTER_READ_FAILED');if(!out.found)return null;var payload=out.overlay.payload;if(!exact(payload,['kind','authorityApprovalId','policyVersion','orchestratorVersion','cycle','record'])||payload.kind!=='E3_ORCHESTRATOR_STATE'||!Number.isSafeInteger(payload.cycle)||payload.cycle<1||!rec(payload.record))throw new Error('ETP_E3_ADAPTER_RECORD_INVALID');return clone(payload.record);}
    async function save(key,value){var p=parseKey(key);if(!p||!exact(value,['version','policyVersion','authorityApprovalId','cycle','day'])||!id(value.authorityApprovalId)||!id(value.policyVersion)||!id(value.version)||!Number.isSafeInteger(value.cycle)||value.cycle<1||typeof value.day!=='string')return false;var parsed;try{parsed=JSON.parse(value.day);}catch(_){return false;}if(!rec(parsed)||parsed.version!=='ETP_CRO_RECONCILIATION_V1'||!rec(parsed.day)||parsed.day.storeId!==s.storeCode||parsed.day.businessDate!==p.date)return false;
      var payload={kind:'E3_ORCHESTRATOR_STATE',authorityApprovalId:value.authorityApprovalId,policyVersion:value.policyVersion,orchestratorVersion:value.version,cycle:value.cycle,record:clone(value)},out=put(repo,'E3',s,'E3-'+p.date,payload,options.now());if(!out.ok){if(out.code==='ETP_ADAPTER_CONCURRENCY_CONFLICT')throw new Error(out.code);return false;}return true;}
    return freeze({ok:true,adapter:freeze({load:load,save:save,canReadVerifiedScope:function(binding){return repo.canReadVerifiedScope(s.scopeKey,binding);}})});
  }
  function createE4(options){
    if(!exact(options,['operationalStore','scopeKey','now'])||!repository(options.operationalStore)||!scope(options.scopeKey)||typeof options.now!=='function')return fail('ETP_E4_ADAPTER_INVALID');var repo=options.operationalStore,s=scope(options.scopeKey);
    function ensure(k){if(k!==s.scopeKey)throw new Error('ETP_E4_ADAPTER_SCOPE_INVALID');}
    function get(overlayId){var out=repo.get({domain:'E4',storeCode:s.storeCode,financialYear:s.financialYear,scopeKey:s.scopeKey,overlayId:overlayId});if(!out||!out.ok)throw new Error('ETP_E4_ADAPTER_READ_FAILED');return out.found?out.overlay.payload:null;}
    function write(overlayId,payload){var out=put(repo,'E4',s,overlayId,payload,options.now());if(!out.ok)throw new Error(out.code);}
    function getOperations(){var out=repo.list({domain:'E4',storeCode:s.storeCode,financialYear:s.financialYear,scopeKey:s.scopeKey});if(!out||!out.ok)throw new Error('ETP_E4_ADAPTER_READ_FAILED');return out.items.map(function(x){return x.overlay.payload;}).filter(function(x){return x.kind==='E4_OPERATION';});}
    var adapter={
      getSourceIntake:function(k){ensure(k);var x=get('E4-SOURCE-INTAKE');if(x&&x.kind!=='E4_SOURCE_INTAKE')throw new Error('ETP_E4_ADAPTER_RECORD_INVALID');return x?clone(x.sources):undefined;},
      saveSourceIntake:function(k,value,operation){ensure(k);if(!rec(value)||!operation||!id(operation.operationId))throw new Error('ETP_E4_ADAPTER_RECORD_INVALID');write('E4-SOURCE-INTAKE',{kind:'E4_SOURCE_INTAKE',sources:clone(value)});write('E4-OP-'+operation.operationId,{kind:'E4_OPERATION',operation:clone(operation)});},
      getVersions:function(k){ensure(k);var x=get('E4-VERSIONS');if(!x)return[];if(x.kind!=='E4_VERSIONS'||!Array.isArray(x.versions))throw new Error('ETP_E4_ADAPTER_RECORD_INVALID');return clone(x.versions);},
      saveVersion:function(k,value,operation){ensure(k);if(!rec(value)||!operation||!id(operation.operationId))throw new Error('ETP_E4_ADAPTER_RECORD_INVALID');var versions=this.getVersions(k);if(versions.some(function(x){return x.versionId===value.versionId;}))throw new Error('ETP_ADAPTER_CONCURRENCY_CONFLICT');versions.push(clone(value));write('E4-VERSIONS',{kind:'E4_VERSIONS',versions:versions});write('E4-OP-'+operation.operationId,{kind:'E4_OPERATION',operation:clone(operation)});},
      findOperation:function(k,operationId){ensure(k);if(!id(operationId))return undefined;var x=get('E4-OP-'+operationId);if(x&&x.kind!=='E4_OPERATION')throw new Error('ETP_E4_ADAPTER_RECORD_INVALID');return x?clone(x.operation):undefined;},
      canReadVerifiedScope:function(binding){return repo.canReadVerifiedScope(s.scopeKey,binding);},
      operations:function(){return getOperations().map(function(x){return clone(x.operation);});}
    };return freeze({ok:true,adapter:freeze(adapter)});
  }
  return freeze({VERSION:VERSION,createE3:createE3,createE4:createE4});
});
