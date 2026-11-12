import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),api=require('../www/etp-operational-foundation.js');
const active=()=>api.registerAuthority({domain:'E3',status:'ACTIVE',sourceSha256:'a'.repeat(64),approvalId:'E3-OWNER-001',approvedAt:'2026-08-25T08:00:00Z',approvedByRole:'Owner',stores:['WLMHW']});
const scope='WLMHW|2026-27|2026-08-01..2026-08-31';
const overlay=(id='day-1')=>({domain:'E3',storeCode:'WLMHW',scopeKey:scope,overlayId:id,updatedAt:'2026-08-25T09:00:00Z',payload:{state:'VARIANCE',actions:[{reasonCode:'SOURCE_REVIEWED'}]}});
test('authority is fail closed and never inferred from Gate 0 catalogues',()=>{assert.equal(api.registerAuthority({domain:'E3',status:'PENDING'}).code,'ETP_AUTHORITY_NOT_ACTIVE');assert.equal(api.authorize(null,{}).code,'ETP_OPERATION_DENIED');assert.equal(active().ok,true);assert.ok(Object.isFrozen(api.ACTIONS));});
test('privileged operations require allowed role, store and fresh reauthentication',()=>{let base={domain:'E3',action:'LOCK',actorId:'owner-1',actorRole:'Owner',storeCode:'WLMHW',at:'2026-08-25T09:05:00Z',reauthenticatedAt:'2026-08-25T09:01:00Z'};assert.equal(api.authorize(active(),base).ok,true);assert.equal(api.authorize(active(),{...base,reauthenticatedAt:'2026-08-25T08:59:59Z'}).code,'ETP_FRESH_REAUTH_REQUIRED');assert.equal(api.authorize(active(),{...base,storeCode:'HEMW'}).code,'ETP_OPERATION_DENIED');assert.equal(api.authorize(active(),{...base,actorRole:'Staff'}).code,'ETP_OPERATION_DENIED');});
test('portable backup carries human overlays but rejects verified facts and PII',()=>{let good=api.createOverlay(overlay());assert.equal(good.ok,true);assert.equal(api.createOverlay({...overlay(),payload:{sourceFacts:[]}}).code,'ETP_OVERLAY_INVALID');assert.equal(api.createOverlay({...overlay(),payload:{action:{customerMobile:'999'}}}).code,'ETP_OVERLAY_INVALID');let backup=api.createPortableBackup([overlay()],'2026-08-25T10:00:00Z');assert.equal(backup.ok,true);assert.doesNotMatch(JSON.stringify(backup),/sourceFacts|customerMobile/);});
test('restore fences every scope until an exact verified generation is rebound',()=>{let backup=api.createPortableBackup([overlay()],'2026-08-25T10:00:00Z').backup,restored=api.restorePortableBackup(backup,'2026-08-25T11:00:00Z').restored,binding={source:'ETP_VERIFIED',scopeKey:scope,generationId:'etp_'+'b'.repeat(32),receiptId:'receipt-new-1'};assert.equal(restored.scopes[0].status,'FENCED_REIMPORT_REQUIRED');assert.equal(api.canReadVerifiedScope(restored,scope,binding),false);restored=api.rebindVerifiedScope(restored,binding).restored;assert.equal(api.canReadVerifiedScope(restored,scope,binding),true);assert.equal(api.canReadVerifiedScope(restored,scope,{...binding,generationId:'etp_'+'c'.repeat(32)}),false);});
test('tampered portable overlays fail deterministic checksum verification',()=>{let backup=api.createPortableBackup([overlay()],'2026-08-25T10:00:00Z').backup,tampered=JSON.parse(JSON.stringify(backup));tampered.overlays[0].payload.state='LOCKED';assert.equal(api.restorePortableBackup(tampered,'2026-08-25T11:00:00Z').code,'ETP_OVERLAY_RESTORE_INVALID');});
test('operational foundation is the first file the on-demand loader runs; the shell no longer names the chain',()=>{let shell=fs.readFileSync(new URL('../www/index.html',import.meta.url),'utf8'),loader=fs.readFileSync(new URL('../www/etp-chain-loader.js',import.meta.url),'utf8'),list=[...loader.matchAll(/^\s*'(etp-[a-z0-9-]+\.js)',?$/gm)].map(m=>m[1]),foundation=list.indexOf('etp-operational-foundation.js');assert.equal(list[0],'etp-operational-foundation.js');assert.equal(foundation,0);for(const id of ['etp-cro-reconciliation.js','etp-target-planning.js','etp-incentive-control.js'])assert.ok(list.indexOf(id)>foundation,id);assert.equal(shell.includes('etp-operational-foundation'),false,'the shell does not name the chain; etp-chain-loader runs it on demand (see phase6h-integration)');});

// D-C (owner decision given in chat, 2026-11-11): the duplicated `date` and `canonical` helpers now live once, in the foundation.
// The frozen pre-change text below is also compared with `git show HEAD:<file>` while HEAD still carries the inline copies.
import {execFileSync} from 'node:child_process';
const OLD_DATE=String.raw`function date(v){var m=typeof v==='string'&&/^(\d{4})-(\d{2})-(\d{2})$/.exec(v),d;if(!m)return'';d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[3]?v:'';}`;
const OLD_CANONICAL=String.raw`function canonical(v){if(Array.isArray(v))return'['+v.map(canonical).join(',')+']';if(record(v))return'{'+Object.keys(v).sort().map(function(k){return JSON.stringify(k)+':'+canonical(v[k]);}).join(',')+'}';return JSON.stringify(v);}`;
const OLD_RECORD=`function record(v){return!!v&&typeof v==='object'&&!Array.isArray(v);}`;
const oldDate=new Function(`${OLD_DATE}return date;`)();
const oldCanonical=new Function(`${OLD_RECORD}${OLD_CANONICAL}return canonical;`)();
const DATE_FILES=['etp-e4-authority-intake','etp-e5-authority-intake','etp-e6-authority-intake','etp-e7-authority-intake','etp-e7-service-verifier','etp-incentive-control'];
const CANONICAL_FILES=['etp-e4-authority-intake','etp-e5-authority-intake','etp-e6-authority-intake','etp-e7-authority-intake'];
const source=(name)=>fs.readFileSync(new URL('../www/'+name+'.js',import.meta.url),'utf8');
const headSource=(name)=>{try{return execFileSync('git',['show','HEAD:www/'+name+'.js'],{cwd:new URL('..',import.meta.url),encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch(_){return null;}};
function dateInputs(){
  const out=['2024-02-29','2023-02-29','1900-02-29','2000-02-29','2100-02-29','2024-12-31','2025-01-01','2026-03-31','2026-04-01','2026-04-30','2026-04-31','2026-12-31','2027-01-01','0000-01-01','9999-12-31','2024-13-01','2024-00-10','2024-01-00','2024-1-1','24-01-01','2024-01-01 ',' 2024-01-01','2024-01-01\n','2024-01-01T00:00:00Z','2024/01/01','','\u0662\u0660\u0662\u0664-01-01','\uFF12\uFF10\uFF12\uFF14-01-01',null,undefined,20240101,true,{},[],['2024-01-01'],new String('2024-01-01')];
  for(const year of [1900,1999,2000,2023,2024,2025,2026,2100])for(let month=1;month<=13;month++)for(let day=0;day<=32;day++)out.push(`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`);
  return out;
}
function canonicalInputs(){
  const nested={z:1,a:{y:[3,2,{b:2,a:1}],x:null},m:'text'};
  return [null,true,false,0,-0,1,1.5,-1e21,1e-7,NaN,Infinity,'','a','A',' a ','a\tb','a\nb','"q"','\\','\u2028\u2029','\u00e9','e\u0301','\u00df','SS','\u0130','\ud83d\ude00','\ud800',[],[1,'1',null],[[],[[]]],{},{a:undefined},{a:()=>1},{b:1,a:2},{a:2,b:1},{'\u00e9':1,'e\u0301':2,e:3,E:4,' e':5,'e ':6},{'key with space':1,'KEY':2,key:3,'10':4,'9':5,'':6},nested,JSON.parse(JSON.stringify(nested)),{k:new Date(0)},{k:new Map([[1,2]])},{'__proto__x':1},JSON.parse('{"__proto__":{"a":1},"b":2}'),Object.create(null),{a:[{b:[{c:[{d:1}]}]}]}];
}
test('foundation exports the shared date and canonical helpers with unchanged results',()=>{
  assert.equal(typeof api.date,'function');assert.equal(typeof api.canonical,'function');
  for(const input of dateInputs())assert.equal(api.date(input),oldDate(input),'date '+String(input));
  assert.equal(api.date('2024-02-29'),'2024-02-29');assert.equal(api.date('2023-02-29'),'');assert.equal(api.date('2026-04-31'),'');
  for(const input of canonicalInputs())assert.equal(api.canonical(input),oldCanonical(input),'canonical '+String(Object.prototype.toString.call(input)));
  assert.equal(api.canonical({b:1,a:[1,{d:2,c:3}]}),'{"a":[1,{"c":3,"d":2}],"b":1}');
});
test('every former consumer now references the foundation and keeps identical canonicalize and load behaviour',()=>{
  for(const name of DATE_FILES){const text=source(name);assert.doesNotMatch(text,/function date\(/,name);assert.match(text,/var date=foundation\.date;/,name);assert.match(text,/ETP_OPERATIONAL_FOUNDATION_REQUIRED/,name);}
  for(const name of CANONICAL_FILES){const text=source(name),exported=require('../www/'+name+'.js');assert.doesNotMatch(text,/function canonical\(/,name);assert.match(text,/var canonical=foundation\.canonical;/,name);assert.equal(exported.canonicalize,api.canonical,name);for(const input of canonicalInputs())assert.equal(exported.canonicalize(input),oldCanonical(input),name);}
  const lineCount=(name)=>source(name).split('\n').length;
  for(const name of DATE_FILES)assert.equal(lineCount(name),(headSource(name)||source(name)).split('\n').length,name+': line count must not move');
});
test('pre-change helper text is exactly what HEAD carried, and old and new consumer canonicalize agree',()=>{
  for(const name of DATE_FILES){const head=headSource(name);if(head===null||!head.includes('function date('))continue;assert.ok(head.split('\n').includes('  '+OLD_DATE),name+': frozen date text must match HEAD');}
  for(const name of CANONICAL_FILES){
    const head=headSource(name);if(head===null||!head.includes('function canonical('))continue;
    assert.ok(head.split('\n').includes('  '+OLD_CANONICAL),name+': frozen canonical text must match HEAD');
    const globalName=/root\.(SaagarEtp\w+)=api/.exec(head)[1],saved=globalThis[globalName],mod={exports:{}};
    try{new Function('module','require',head)(mod,undefined);}finally{if(saved===undefined)delete globalThis[globalName];else globalThis[globalName]=saved;}
    const fresh=require('../www/'+name+'.js');
    for(const input of canonicalInputs())assert.equal(fresh.canonicalize(input),mod.exports.canonicalize(input),name);
  }
});
test('a consumer fails closed when the foundation is unavailable and resolves it through require otherwise',()=>{
  const name='etp-e7-service-verifier',text=source(name),saved=globalThis.SaagarEtpOperationalFoundation,savedSelf=globalThis.SaagarEtpE7ServiceVerifier;
  try{
    delete globalThis.SaagarEtpOperationalFoundation;
    assert.throws(()=>new Function('module','require',text)({exports:{}},undefined),/ETP_OPERATIONAL_FOUNDATION_REQUIRED/);
    assert.throws(()=>new Function('module','require',text)({exports:{}},()=>({})),/ETP_OPERATIONAL_FOUNDATION_REQUIRED/);
    const mod={exports:{}};new Function('module','require',text)(mod,(id)=>{assert.equal(id,'./etp-operational-foundation.js');return api;});assert.equal(typeof mod.exports.verify,'function');
    globalThis.SaagarEtpOperationalFoundation=api;const viaGlobal={exports:{}};new Function('module','require',text)(viaGlobal,undefined);assert.equal(typeof viaGlobal.exports.verify,'function');
  }finally{if(saved===undefined)delete globalThis.SaagarEtpOperationalFoundation;else globalThis.SaagarEtpOperationalFoundation=saved;if(savedSelf===undefined)delete globalThis.SaagarEtpE7ServiceVerifier;else globalThis.SaagarEtpE7ServiceVerifier=savedSelf;}
});
