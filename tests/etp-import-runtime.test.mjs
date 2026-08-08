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

const scope={storeCode:'WLMHW',financialYear:'2026-27',periodStart:'2026-04-01',periodEnd:'2026-04-30'};
function loaded(id){
  const common={transactionTypeRaw:'INV',storeCode:'WLMHW',invoiceNumber:'INV-1',invoiceDate:'20260415'};
  const fields=id==='R022'?{...common,invoiceQuantity:'1.000',netValue:'10.00'}:id==='R025'?{...common,itemNumber:'ITEM-1',quantity:'1.000',netValue:'10.00'}:id==='R013'?{...common,itemNumber:'ITEM-1',croNumber:'CRO-1',quantity:'1.000',netAmount:'9.00',netValue:'10.00'}:{...common,itemNumber:'ITEM-1',quantity:'1.000',netAmount:'9.00',netValue:'10.00'};
  return {ok:true,reportId:id,storeCode:'WLMHW',signatureKey:'signature-'+id,rows:[{businessDate:'2026-04-15',fields}]};
}
function harness(loaderOverride){
  const calls=[];
  const nativeApi={create:()=>({ok:true,adapter:{beginStage:async()=>{calls.push('begin');return {ok:true};},appendChunk:async()=>{calls.push('append');return {ok:true};},finishStage:async()=>{calls.push('finish');return {ok:true};},publish:async()=>{calls.push('publish');return {ok:true};}}})};
  const made=runtimeApi.create({profile:{REPORTS:{R003:{fields:{}},R013:{fields:{}},R022:{fields:{}},R025:{fields:{}}}},loader:loaderOverride||{load:async input=>loaded(input.selectedReportId)},lifecyclePolicy:lifecycle,coordinatorApi:coordinator,nativeApi,reconciliationPolicy:reconciliation,plugin:{},crypto:crypto.webcrypto,datePolicy:{earliestDate:'2024-04-01',asOfDate:'2026-08-08',maxFutureDays:2}});
  assert.equal(made.ok,true);return {runtime:made.runtime,calls};
}
function request(){return {scope,files:['R003','R013','R022','R025'].map(id=>({selectedReportId:id,file:{name:id+'.xlsx',arrayBuffer:async()=>new TextEncoder().encode(id).buffer}})),confirmed:false};}

test('browser facade completes four-report parse, validation, reconciliation, staging and confirmation',async()=>{
  const h=harness(),checked=await h.runtime.run(request());
  assert.equal(checked.ok,true);assert.equal(checked.awaitingConfirmation,true);
  assert.deepEqual(h.calls,['begin','append','append','append','append','finish']);
  const published=await h.runtime.confirm(checked.lifecycle);
  assert.equal(published.ok,true);assert.equal(published.lifecycle.state,'ACCEPTED');assert.equal(h.calls.at(-1),'publish');
});

test('precise numeric identifier refusal is surfaced without native staging',async()=>{
  const h=harness({load:async()=>({ok:false,code:'XLSX_IDENTIFIER_NUMERIC_UNVERIFIED'})});
  const result=await h.runtime.run(request());
  assert.equal(result.code,'XLSX_IDENTIFIER_NUMERIC_UNVERIFIED');
  assert.equal(result.coordinatorCode,'ETP_PARSE_REJECTED');
  assert.deepEqual(h.calls,[]);
});

test('shell loads pinned local bundles and runtime dependencies before the UI',()=>{
  const shell=fs.readFileSync(new URL('../www/index.html',import.meta.url),'utf8');
  const order=['vendor/fflate-0.8.3.min.js','vendor/read-excel-file-9.3.7.min.js','etp-import-foundation.js','etp-xlsx-preflight.js','etp-retail-xlsx-loader.js','etp-native-store.js','etp-import-coordinator.js','etp-import-runtime.js','etp-import-ui.js'].map(src=>shell.indexOf(`<script src="${src}"></script>`));
  assert.ok(order.every(at=>at>=0));assert.deepEqual(order,order.slice().sort((a,b)=>a-b));
  assert.doesNotMatch(shell.slice(order[0],order.at(-1)),/https?:\/\//);
});

test('staged browser assets exactly match pinned installed dependency bytes',()=>{
  assert.deepEqual(fs.readFileSync(new URL('../www/vendor/read-excel-file-9.3.7.min.js',import.meta.url)),fs.readFileSync(new URL('../node_modules/read-excel-file/bundle/read-excel-file.min.js',import.meta.url)));
  assert.deepEqual(fs.readFileSync(new URL('../www/vendor/fflate-0.8.3.min.js',import.meta.url)),fs.readFileSync(new URL('../node_modules/fflate/umd/index.js',import.meta.url)));
});

test('facade compiles a native-safe fact dictionary from the complete Retail profile',()=>{
  const made=runtimeApi.create({profile,loader:{load:async()=>({ok:false})},lifecyclePolicy:lifecycle,coordinatorApi:coordinator,nativeApi,reconciliationPolicy:reconciliation,plugin:{},crypto:crypto.webcrypto,datePolicy:{earliestDate:'2024-04-01',asOfDate:'2026-08-08',maxFutureDays:2}});
  assert.equal(made.ok,true);
});
