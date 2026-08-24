/* Bounded metadata-only Retail ETP import history. Workbook material, source
   labels, paths, rows and PII are outside this contract. */
(function(root,factory){
  'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SaagarEtpImportHistory=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var VERSION='ETP_IMPORT_HISTORY_V1',KEY='saagar_etp_import_history_v1',MAX_PER_SCOPE=20,MAX_GLOBAL=100,MAX_WARNINGS=12,MAX_DIGEST_REFS=8,MAX_BYTES=256*1024;
  var OUTCOMES=Object.freeze(['VALIDATED','REJECTED','ABORTED','FAILED_RETRYABLE','FAILED_FINAL','DUPLICATE_NOOP','ACCEPTED']);
  var BLOCKED=Object.freeze(['__proto__','prototype','constructor']);
  function freeze(value){return Object.freeze(value);}function plain(value){if(!value||typeof value!=='object'||Array.isArray(value))return false;var proto=Object.getPrototypeOf(value);return proto===Object.prototype||proto===null;}function exact(value,keys){if(!plain(value))return false;var actual=Object.keys(value).sort(),expected=keys.slice().sort();return actual.length===expected.length&&actual.every(function(key,index){return key===expected[index]&&BLOCKED.indexOf(key)<0;});}
  function fail(code){return freeze({ok:false,code:code});}
  function token(value,max){var out=String(value==null?'':value).trim();return out&&out.length<=max&&/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(out)?out:'';}
  function isoDate(value){var raw=String(value||''),match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);if(!match)return'';var date=new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])));return date.getUTCFullYear()===Number(match[1])&&date.getUTCMonth()===Number(match[2])-1&&date.getUTCDate()===Number(match[3])?raw:'';}
  function timestamp(value){var raw=String(value||'');if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(raw))return'';var time=Date.parse(raw);return Number.isFinite(time)?new Date(time).toISOString():'';}
  function financialYear(value){var match=/^(\d{4})-(\d{2})$/.exec(String(value||''));return match&&Number(match[2])===(Number(match[1])+1)%100?match[0]:'';}
  function yearOf(date){var year=Number(date.slice(0,4)),start=date.slice(5,7)>='04'?year:year-1,end=String((start+1)%100);return String(start)+'-'+(end.length<2?'0'+end:end);}
  function safeCount(value){return Number.isSafeInteger(value)&&value>=0&&value<=1000000;}
  function validate(value){
    try {
    var keys=['contractVersion','eventId','scopeKey','storeCode','financialYear','periodStart','periodEnd','outcome','warningCodes','counts','actorId','occurredAt','digestRefs'];
    if(!exact(value,keys)||value.contractVersion!==VERSION)return fail('ETP_IMPORT_HISTORY_EVENT_INVALID');
    var eventId=token(value.eventId,96),store=String(value.storeCode||''),fy=financialYear(value.financialYear),start=isoDate(value.periodStart),end=isoDate(value.periodEnd),outcome=String(value.outcome||'').toUpperCase(),actor=token(value.actorId,80),at=timestamp(value.occurredAt);
    var scopeKey=[store,fy,start+'..'+end].join('|');
    if(!eventId||['WLMHW','HEMW'].indexOf(store)<0||!fy||!start||!end||start>end||yearOf(start)!==fy||yearOf(end)!==fy||value.scopeKey!==scopeKey||OUTCOMES.indexOf(outcome)<0||!actor||!at)return fail('ETP_IMPORT_HISTORY_EVENT_INVALID');
    if(!exact(value.counts,['sourceCount','selectedCount','excludedCount'])||!safeCount(value.counts.sourceCount)||!safeCount(value.counts.selectedCount)||!safeCount(value.counts.excludedCount)||value.counts.selectedCount+value.counts.excludedCount!==value.counts.sourceCount)return fail('ETP_IMPORT_HISTORY_COUNTS_INVALID');
    if(!Array.isArray(value.warningCodes)||value.warningCodes.length>MAX_WARNINGS)return fail('ETP_IMPORT_HISTORY_WARNINGS_INVALID');var warnings=[];
    for(var i=0;i<value.warningCodes.length;i++){var warning=String(value.warningCodes[i]||'').toUpperCase();if(!/^[A-Z][A-Z0-9_]{0,79}$/.test(warning)||warnings.indexOf(warning)>=0)return fail('ETP_IMPORT_HISTORY_WARNINGS_INVALID');warnings.push(warning);}warnings.sort();
    if(!Array.isArray(value.digestRefs)||!value.digestRefs.length||value.digestRefs.length>MAX_DIGEST_REFS)return fail('ETP_IMPORT_HISTORY_DIGEST_INVALID');var digests=[];
    for(i=0;i<value.digestRefs.length;i++){var digest=String(value.digestRefs[i]||'').toLowerCase();if(!/^sha256:[a-f0-9]{64}$/.test(digest)||digests.indexOf(digest)>=0)return fail('ETP_IMPORT_HISTORY_DIGEST_INVALID');digests.push(digest);}digests.sort();
    return freeze({ok:true,event:freeze({contractVersion:VERSION,eventId:eventId,scopeKey:scopeKey,storeCode:store,financialYear:fy,periodStart:start,periodEnd:end,outcome:outcome,warningCodes:freeze(warnings),counts:freeze({sourceCount:value.counts.sourceCount,selectedCount:value.counts.selectedCount,excludedCount:value.counts.excludedCount}),actorId:actor,occurredAt:at,digestRefs:freeze(digests)})});
    }catch(_){return fail('ETP_IMPORT_HISTORY_EVENT_INVALID');}
  }
  function compare(a,b){return b.occurredAt.localeCompare(a.occurredAt)||a.eventId.localeCompare(b.eventId);}
  function sanitizedEvents(value){if(!plain(value)||value.contractVersion!==VERSION||!Array.isArray(value.events))return[];var out=[],seen=Object.create(null);for(var i=0;i<value.events.length;i++){var checked=validate(value.events[i]);if(checked.ok&&!seen[checked.event.eventId]){seen[checked.event.eventId]=true;out.push(checked.event);}}out.sort(compare);return out.slice(0,MAX_GLOBAL);}
  function create(options){
    var storage=options&&options.storage;if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function')return fail('ETP_IMPORT_HISTORY_DEPENDENCY_INVALID');
    function load(){try{return sanitizedEvents(JSON.parse(storage.getItem(KEY)||'{"contractVersion":"'+VERSION+'","events":[]}'));}catch(_){return[];}}
    function bounded(events){var per=Object.create(null),out=[];events.sort(compare);for(var i=0;i<events.length&&out.length<MAX_GLOBAL;i++){var key=events[i].scopeKey,count=per[key]||0;if(count<MAX_PER_SCOPE){per[key]=count+1;out.push(events[i]);}}return out;}
    function append(value){var checked=validate(value);if(!checked.ok)return checked;var events=load(),existing=null;for(var i=0;i<events.length;i++)if(events[i].eventId===checked.event.eventId){existing=events[i];break;}if(existing){return JSON.stringify(existing)===JSON.stringify(checked.event)?freeze({ok:true,changed:false,event:existing}):fail('ETP_IMPORT_HISTORY_EVENT_CONFLICT');}events=bounded(events.concat([checked.event]));var serialized=JSON.stringify({contractVersion:VERSION,events:events});if(serialized.length>MAX_BYTES)return fail('ETP_IMPORT_HISTORY_CAPACITY_EXCEEDED');try{storage.setItem(KEY,serialized);return freeze({ok:true,changed:true,event:checked.event});}catch(_){return fail('ETP_IMPORT_HISTORY_WRITE_FAILED');}}
    function list(scopeKey,limit){var key=String(scopeKey||'');if(!/^(?:WLMHW|HEMW)\|\d{4}-\d{2}\|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/.test(key)||!Number.isSafeInteger(limit)||limit<0||limit>MAX_PER_SCOPE)return fail('ETP_IMPORT_HISTORY_LIST_INVALID');return freeze({ok:true,events:freeze(load().filter(function(event){return event.scopeKey===key;}).slice(0,limit))});}
    function listAll(limit){if(!Number.isSafeInteger(limit)||limit<0||limit>MAX_GLOBAL)return fail('ETP_IMPORT_HISTORY_LIST_INVALID');return freeze({ok:true,events:freeze(load().slice(0,limit))});}
    return freeze({ok:true,history:freeze({append:append,list:list,listAll:listAll})});
  }
  return freeze({VERSION:VERSION,KEY:KEY,OUTCOMES:OUTCOMES,MAX_PER_SCOPE:MAX_PER_SCOPE,MAX_GLOBAL:MAX_GLOBAL,MAX_WARNINGS:MAX_WARNINGS,MAX_DIGEST_REFS:MAX_DIGEST_REFS,MAX_BYTES:MAX_BYTES,validateEvent:validate,create:create});
});
