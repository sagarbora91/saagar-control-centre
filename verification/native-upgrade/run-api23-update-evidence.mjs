#!/usr/bin/env node
/* Emulator engineering evidence only.
   Seeds synthetic operational data through the public app runtime, replaces the
   APK with `adb install -r` (never pm clear), and verifies the preserved store. */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { WebSocket } from 'ws';

const PACKAGE='com.saagartraders.bcc', RECORDS=6567, LARGE_CHARS=3*1024*1024+137;
const LARGE_VALUE_CHARS='LARGE-BEGIN|'.length+LARGE_CHARS+'|LARGE-END'.length;
const args=Object.fromEntries(process.argv.slice(2).map((v,i,a)=>v.startsWith('--')?[v.slice(2),a[i+1]]:null).filter(Boolean));
const baseline=path.resolve(String(args.baseline||'')),candidate=path.resolve(String(args.candidate||''));
const out=path.resolve(String(args.out||path.join('verification','native-upgrade','API23-UPDATE-EVIDENCE.json')));
const sdk=process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Android','Sdk');
const adb=String(args.adb||sdk&&path.join(sdk,'platform-tools','adb.exe')||'adb');
function run(parts,options={}){return execFileSync(adb,parts,{encoding:options.binary?null:'utf8',maxBuffer:64*1024*1024,...options});}
function sha(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function httpJson(port,url='/json'){return new Promise((resolve,reject)=>{http.get({host:'127.0.0.1',port,path:url},r=>{let b='';r.on('data',x=>b+=x);r.on('end',()=>{try{resolve(JSON.parse(b));}catch(e){reject(e);}});}).on('error',reject);});}
function cdp(wsUrl){return new Promise((resolve,reject)=>{const ws=new WebSocket(wsUrl);let id=0;const pending=new Map();ws.on('open',()=>resolve({evaluate(expression,timeout=240000,awaitPromise=false){return new Promise((res,rej)=>{const n=++id,t=setTimeout(()=>{pending.delete(n);rej(new Error('CDP_EVALUATION_TIMEOUT'));},timeout);pending.set(n,{res,rej,t});ws.send(JSON.stringify({id:n,method:'Runtime.evaluate',params:{expression,awaitPromise,returnByValue:true}}));});},close(){ws.close();}}));ws.on('message',raw=>{const m=JSON.parse(String(raw)),p=pending.get(m.id);if(!p)return;clearTimeout(p.t);pending.delete(m.id);if(m.error||m.result?.exceptionDetails)p.rej(new Error(JSON.stringify(m.error||m.result.exceptionDetails)));else p.res(m.result?.result?.value);});ws.on('error',reject);});}
function packagePid(serial){const lines=run(['-s',serial,'shell','ps']).split(/\r?\n/);for(const line of lines){const columns=line.trim().split(/\s+/);if(columns.length>1&&columns[columns.length-1]===PACKAGE&&/^\d+$/.test(columns[1]))return columns[1];}return '';}
async function browser(serial){let pid='';for(let i=0;i<40&&!pid;i++){pid=packagePid(serial);if(!pid)await sleep(250);}if(!pid)throw new Error('APP_PROCESS_NOT_FOUND');const port=Number(run(['-s',serial,'forward','tcp:0','localabstract:webview_devtools_remote_'+pid]).trim());let pages=[];for(let i=0;i<40&&!pages.length;i++){try{pages=await httpJson(port);}catch{}if(!pages.length)await sleep(250);}const page=pages.find(x=>x.type==='page')||pages[0];if(!page?.webSocketDebuggerUrl)throw new Error('WEBVIEW_DEBUG_TARGET_NOT_FOUND');return cdp(page.webSocketDebuggerUrl.replace(/ws:\/\/[^/]+/,`ws://127.0.0.1:${port}`));}
async function launch(serial){run(['-s',serial,'shell','am','force-stop',PACKAGE]);run(['-s',serial,'shell','monkey','-p',PACKAGE,'-c','android.intent.category.LAUNCHER','1']);await sleep(1200);return browser(serial);}
async function evaluateJob(client,name,expression,timeout){const slot='__saagarUpgrade_'+name;const start=`(function(){window[${JSON.stringify(slot)}]={state:'running'};Promise.resolve(${expression}).then(function(value){window[${JSON.stringify(slot)}]={state:'done',value:value};},function(error){window[${JSON.stringify(slot)}]={state:'error',code:String(error&&error.code||'JOB_FAILED')};});return 'STARTED';})()`;const started=await client.evaluate(start,10000,false);if(started!=='STARTED')throw new Error('CDP_JOB_START_FAILED');const deadline=Date.now()+timeout;while(Date.now()<deadline){const raw=await client.evaluate(`JSON.stringify(window[${JSON.stringify(slot)}]||null)`,10000,false);const state=raw&&JSON.parse(raw);if(state?.state==='done')return state.value;if(state?.state==='error')throw new Error(state.code||'CDP_JOB_FAILED');await sleep(250);}throw new Error('CDP_JOB_TIMEOUT');}
const hashExpression=`function h(v){var bytes=new TextEncoder().encode(v);return crypto.subtle.digest('SHA-256',bytes).then(function(b){var a=new Uint8Array(b),s='',i,x;for(i=0;i<a.length;i++){x=a[i].toString(16);s+=(x.length===1?'0':'')+x;}return s;});}`;
const seedExpression=`(function(){function waitReady(left){if(window.SaagarStore&&SaagarStore.ready&&SaagarStore.ready())return Promise.resolve(true);if(left<1)return Promise.resolve(false);return new Promise(function(r){setTimeout(r,250);}).then(function(){return waitReady(left-1);});}function b64(bytes){var chunk=32768,out='',i;for(i=0;i<bytes.length;i+=chunk)out+=String.fromCharCode.apply(null,bytes.subarray(i,i+chunk));return btoa(out);}return waitReady(240).then(function(ready){var plugins=window.Capacitor&&Capacitor.Plugins,nativeStore=plugins&&plugins.SaagarNativeStore,fs=plugins&&plugins.Filesystem,keystore=plugins&&plugins.SaagarKeystore;if(!ready||!nativeStore||!fs||!keystore)return {ok:false,code:'SEED_RUNTIME_UNAVAILABLE'};var prefix='saagar_upgrade_probe_',large='LARGE-BEGIN|'+('X'.repeat(${LARGE_CHARS}))+'|LARGE-END',dekBytes=new Uint8Array(32),dekKey;crypto.getRandomValues(dekBytes);${hashExpression}function valueAt(index){return JSON.stringify({synthetic:true,index:index,pad:'P'.repeat(48)});}function encode(key,value,seq){var iv=new Uint8Array(12),plain=new TextEncoder().encode(JSON.stringify([key,value]));crypto.getRandomValues(iv);return Promise.all([h(key),crypto.subtle.encrypt({name:'AES-GCM',iv:iv},dekKey,plain)]).then(function(parts){var ciphertext=new Uint8Array(parts[1]),envelope=new Uint8Array(iv.length+ciphertext.length);envelope.set(iv,0);envelope.set(ciphertext,iv.length);return {type:'set',keyId:parts[0],payload:'SBKV1:'+b64(envelope),seq:seq};});}function makeSmall(index){var label=('0000'+String(index)).slice(-4);return encode(prefix+label,valueAt(index),index+1);}function writeSmall(start){if(start>=${RECORDS-1})return Promise.resolve();var end=Math.min(start+32,${RECORDS-1}),tasks=[],i;for(i=start;i<end;i++)tasks.push(makeSmall(i));return Promise.all(tasks).then(function(ops){return nativeStore.applyBatch({ops:ops,stage:true,clear:false});}).then(function(){return new Promise(function(r){setTimeout(r,0);});}).then(function(){return writeSmall(end);});}return crypto.subtle.importKey('raw',dekBytes,{name:'AES-GCM'},false,['encrypt','decrypt']).then(function(key){dekKey=key;return keystore.wrapKey({data:b64(dekBytes)});}).then(function(wrapped){return fs.writeFile({path:'bcc.dek.tmp',data:wrapped.wrapped,directory:'DATA'}).then(function(){return fs.rename({from:'bcc.dek.tmp',to:'bcc.dek',directory:'DATA'});});}).then(function(){return nativeStore.beginMigration({});}).then(function(){return writeSmall(0);}).then(function(){return encode(prefix+'large',large,${RECORDS});}).then(function(op){return nativeStore.applyBatch({ops:[op],stage:true,clear:false});}).then(function(){return nativeStore.finishMigration({expectedRows:${RECORDS}});}).then(function(finished){return Promise.all([h(large),nativeStore.status({})]).then(function(parts){return {ok:finished&&finished.migrated===true&&finished.rows===${RECORDS},generatedRecords:${RECORDS},largeChars:large.length,largeSha256:parts[0],sentinel0:valueAt(0),sentinelLast:valueAt(${RECORDS-2}),status:parts[1]};});});});})()`;
const verifyExpression=`(function(){function waitDone(left){var store=window.SaagarStore,recovery=store&&store.recoveryStatus&&store.recoveryStatus();if(store&&((store.ready&&store.ready())||(recovery&&recovery.state==='blocked')))return Promise.resolve(true);if(left<1)return Promise.resolve(false);return new Promise(function(r){setTimeout(r,250);}).then(function(){return waitDone(left-1);});}return waitDone(1200).then(function(){var store=window.SaagarStore,recovery=store&&store.recoveryStatus&&store.recoveryStatus();if(!store||!store.ready())return {ok:false,code:'STORE_NOT_READY_AFTER_UPDATE',recovery:recovery,status:store&&store._status&&store._status()};var prefix='saagar_upgrade_probe_',large=localStorage.getItem(prefix+'large'),count=0,i,label;for(i=0;i<${RECORDS-1};i++){label=('0000'+String(i)).slice(-4);if(localStorage.getItem(prefix+label)!==null)count++;}if(large!==null)count++;${hashExpression}return (large?h(large):Promise.resolve(null)).then(function(digest){return {ok:!!large&&count===${RECORDS},generatedRecordsFound:count,largeChars:large&&large.length,largeSha256:digest,sentinel0:localStorage.getItem(prefix+'0000'),sentinelLast:localStorage.getItem(prefix+'6565'),status:SaagarStore._status(),recovery:recovery};});});})()`;
async function main(){
  if(!fs.existsSync(baseline)||!fs.existsSync(candidate))throw new Error('Both --baseline and --candidate APK files are required.');
  const devices=run(['devices']).split(/\r?\n/).slice(1).map(x=>x.trim().split(/\s+/)).filter(x=>x[1]==='device');
  const selected=args.serial?devices.find(x=>x[0]===args.serial):devices.length===1&&devices[0];
  if(!selected||!/^emulator-\d+$/.test(selected[0]))throw new Error('Refusing to run: select exactly one Android emulator with --serial. Physical devices are forbidden.');
  const serial=selected[0],api=Number(run(['-s',serial,'shell','getprop','ro.build.version.sdk']).trim());
  if(api!==23)throw new Error('This evidence requires API 23; detected '+api+'.');
  const evidence={classification:'EMULATOR_ENGINEERING_ONLY',formalDeviceAcceptance:false,createdAt:new Date().toISOString(),serial,api,package:PACKAGE,generated:{records:RECORDS,largePlaintextBodyChars:LARGE_CHARS},baseline:{path:baseline,sha256:sha(baseline)},candidate:{path:candidate,sha256:sha(candidate)}};
  run(['-s',serial,'install','-r','-d',baseline]);run(['-s',serial,'shell','pm','clear',PACKAGE]);
  let client=await launch(serial);evidence.seed=await evaluateJob(client,'seed',seedExpression,600000);client.close();if(!evidence.seed?.ok)throw new Error('Synthetic seed failed: '+JSON.stringify(evidence.seed));
  evidence.uidBefore=run(['-s',serial,'shell','dumpsys','package',PACKAGE]).match(/userId=(\d+)/)?.[1]||'';
  run(['-s',serial,'shell','am','force-stop',PACKAGE]);run(['-s',serial,'logcat','-c']);
  evidence.installReplace=run(['-s',serial,'install','-r','-d',candidate]).trim();
  evidence.uidAfter=run(['-s',serial,'shell','dumpsys','package',PACKAGE]).match(/userId=(\d+)/)?.[1]||'';
  client=await launch(serial);evidence.verify=await evaluateJob(client,'verify',verifyExpression,300000);client.close();
  evidence.logcat=run(['-s',serial,'logcat','-d','-v','threadtime','CursorWindow:E','SQLiteBlobTooBigException:E','chromium:I','SaagarNativeStore:I','*:S']).slice(-20000);
  const verifyStatus=evidence.verify&&evidence.verify.status;
  const verifyRecovery=evidence.verify&&evidence.verify.recovery;
  evidence.checks={
    installReplaceSucceeded:typeof evidence.installReplace==='string'&&/\bSuccess\s*$/i.test(evidence.installReplace)&&!/\bFailure\b/i.test(evidence.installReplace),
    uidPreserved:typeof evidence.uidBefore==='string'&&evidence.uidBefore.length>0&&evidence.uidBefore===evidence.uidAfter,
    verifyJobSucceeded:evidence.verify&&evidence.verify.ok===true,
    generatedRecordCountPreserved:evidence.verify&&evidence.verify.generatedRecordsFound===RECORDS,
    sentinelsPreserved:typeof evidence.seed?.sentinel0==='string'&&typeof evidence.seed?.sentinelLast==='string'&&evidence.verify&&evidence.verify.sentinel0===evidence.seed.sentinel0&&evidence.verify.sentinelLast===evidence.seed.sentinelLast,
    largeLengthPreserved:evidence.seed?.largeChars===LARGE_VALUE_CHARS&&evidence.verify&&evidence.verify.largeChars===LARGE_VALUE_CHARS,
    largeHashPreserved:typeof evidence.seed?.largeSha256==='string'&&/^[a-f0-9]{64}$/.test(evidence.seed.largeSha256)&&evidence.verify&&evidence.verify.largeSha256===evidence.seed.largeSha256,
    runtimeReady:verifyStatus&&verifyStatus.ready===true&&verifyRecovery&&verifyRecovery.state==='ready',
    runtimeNotBlocked:verifyStatus&&verifyStatus.storageBlocked===false,
    rowCountsReconciled:verifyRecovery&&verifyRecovery.expectedRows===RECORDS&&verifyRecovery.loadedRows===RECORDS&&verifyRecovery.expectedRows===verifyRecovery.loadedRows&&verifyRecovery.loadedRows===evidence.generated.records,
    nativeIncrementalMode:verifyStatus&&verifyStatus.persistenceMode==='native-incremental'
  };
  evidence.pass=Object.values(evidence.checks).every(Boolean);
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({pass:evidence.pass,out,checks:evidence.checks,verify:evidence.verify,classification:evidence.classification},null,2));
  if(!evidence.pass)process.exitCode=2;
}
main().catch(error=>{console.error(error&&error.stack||error);process.exitCode=1;});
