import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const runtimeApi=require('../www/etp-import-runtime.js');
const lifecycle=require('../www/etp-store-lifecycle-policy.js');
const coordinator=require('../www/etp-import-coordinator.js');
const reconciliation=require('../www/etp-reconciliation-policy.js');
const profile=require('../www/etp-retail-profile.js');
const nativeApi=require('../www/etp-native-store.js');
const core=require('../www/etp-core-contract.js');
const registryApi=require('../www/etp-control-registry.js');
const readerApi=require('../www/etp-verified-reader.js');

const scope={storeCode:'WLMHW',financialYear:'2026-27',periodStart:'2026-04-01',periodEnd:'2026-04-30'};
function loaded(id){
  const common={transactionTypeRaw:'INV',storeCode:'WLMHW',invoiceNumber:'INV-1',invoiceDate:'20260415'};
  const fields=id==='R022'?{...common,invoiceQuantity:'1.000',netValue:'10.00'}:id==='R025'?{...common,itemNumber:'ITEM-1',quantity:'1.000',netAmount:'10.00',netValue:'11.80'}:id==='R013'?{...common,itemNumber:'ITEM-1',croNumber:'CRO-1',quantity:'1.000',netAmount:'9.00',netValue:'10.00'}:{...common,itemNumber:'ITEM-1',quantity:'1.000',netAmount:'9.00',netValue:'10.00'};
  return {ok:true,reportId:id,storeCode:'WLMHW',signatureKey:'signature-'+id,rows:[{businessDate:'2026-04-15',fields}]};
}
function harness(loaderOverride){
  const calls=[];
  const nativeApi={create:()=>({ok:true,adapter:{readStatus:async()=>({ok:true,status:{state:'EMPTY',activeGenerationId:null,restoreFence:false}}),beginStage:async()=>{calls.push('begin');return {ok:true};},appendChunk:async()=>{calls.push('append');return {ok:true};},finishStage:async()=>{calls.push('finish');return {ok:true};},publish:async()=>{calls.push('publish');return {ok:true};}}})};
  const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
  const made=runtimeApi.create({profile,loader:loaderOverride||{load:async input=>loaded(input.selectedReportId)},testOnlySynchronousParser:true,lifecyclePolicy:lifecycle,coordinatorApi:coordinator,nativeApi,reconciliationPolicy:reconciliation,coreContract:core,controlRegistryApi:registryApi,verifiedReaderApi:readerApi,storage,authorizePublication:async()=>true,plugin:{},crypto:crypto.webcrypto,datePolicy:{earliestDate:'2024-04-01',asOfDate:'2026-08-08',maxFutureDays:2}});
  assert.equal(made.ok,true);return {runtime:made.runtime,calls};
}
function request(){return {scope,files:['R003','R013','R022','R025'].map(id=>({selectedReportId:id,file:{name:id+'.xlsx',arrayBuffer:async()=>new TextEncoder().encode(id).buffer}})),coverageDeclaration:{confirmed:true,confirmedByRole:'OWNER',reports:Object.fromEntries(['R003','R013','R022','R025'].map(id=>[id,{status:'COMPLETE'}]))},confirmed:false};}

test('browser facade completes four-report parse, validation, reconciliation, staging and confirmation',async()=>{
  const h=harness(),checked=await h.runtime.run(request());
  assert.equal(checked.ok,true,JSON.stringify(checked));assert.equal(checked.awaitingConfirmation,true);
  assert.deepEqual(h.calls,['begin','append','append','append','append','finish']);
  const published=await h.runtime.confirm(checked.lifecycle);
  assert.equal(published.ok,true);assert.equal(published.lifecycle.state,'ACCEPTED');assert.equal(h.calls.at(-1),'publish');
  assert.equal(published.receipt.ruleVersion,'rec_002_v1');
});

test('precise numeric identifier refusal is surfaced without native staging',async()=>{
  const h=harness({load:async()=>({ok:false,code:'XLSX_IDENTIFIER_NUMERIC_UNVERIFIED'})});
  const result=await h.runtime.run(request());
  assert.equal(result.code,'XLSX_IDENTIFIER_NUMERIC_UNVERIFIED');
  assert.equal(result.coordinatorCode,'ETP_PARSE_REJECTED');
  assert.deepEqual(h.calls,[]);
});

test('non-zero unresolved PAYMENTTYPE25 is excluded and recorded as quarantine metadata',async()=>{
  const h=harness({load:async input=>{const value=loaded(input.selectedReportId);if(input.selectedReportId==='R022')value.rows[0].fields.paymentType25Amount='1.00';return value;}}),checked=await h.runtime.run(request());
  assert.equal(checked.ok,true);const result=await h.runtime.confirm(checked.lifecycle);assert.equal(result.receipt.enrichments.paymentType25.rowCount,1);assert.equal(result.receipt.enrichments.paymentType25.persisted,false);
});

test('shell loads pinned local bundles and runtime dependencies before the UI',()=>{
  const shell=fs.readFileSync(new URL('../www/index.html',import.meta.url),'utf8');
  const order=['vendor/fflate-0.8.3.min.js','vendor/read-excel-file-9.3.7.min.js','etp-import-foundation.js','etp-xlsx-preflight.js','etp-retail-xlsx-loader.js','etp-core-contract.js','etp-native-store.js','etp-control-registry.js','etp-verified-reader.js','etp-worker-client.js','etp-import-coordinator.js','etp-import-runtime.js','etp-import-ui.js'].map(src=>shell.indexOf(`<script src="${src}"></script>`));
  assert.ok(order.every(at=>at>=0));assert.deepEqual(order,order.slice().sort((a,b)=>a-b));
  assert.doesNotMatch(shell.slice(order[0],order.at(-1)),/https?:\/\//);
});

test('staged browser assets exactly match pinned installed dependency bytes',()=>{
  assert.deepEqual(fs.readFileSync(new URL('../www/vendor/read-excel-file-9.3.7.min.js',import.meta.url)),fs.readFileSync(new URL('../node_modules/read-excel-file/bundle/read-excel-file.min.js',import.meta.url)));
  assert.deepEqual(fs.readFileSync(new URL('../www/vendor/fflate-0.8.3.min.js',import.meta.url)),fs.readFileSync(new URL('../node_modules/fflate/umd/index.js',import.meta.url)));
});

test('facade compiles a native-safe fact dictionary from the complete Retail profile',()=>{
  const storage={getItem:()=>null,setItem:()=>{}};
  const made=runtimeApi.create({profile,loader:{load:async()=>({ok:false})},testOnlySynchronousParser:true,lifecyclePolicy:lifecycle,coordinatorApi:coordinator,nativeApi,reconciliationPolicy:reconciliation,coreContract:core,controlRegistryApi:registryApi,verifiedReaderApi:readerApi,storage,authorizePublication:async()=>true,plugin:{},crypto:crypto.webcrypto,datePolicy:{earliestDate:'2024-04-01',asOfDate:'2026-08-08',maxFutureDays:2}});
  assert.equal(made.ok,true);
});
