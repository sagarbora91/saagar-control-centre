import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const consumer=require('../www/etp-analytics-consumer.js');
const shell=fs.readFileSync(new URL('../www/index.html',import.meta.url),'utf8');
const dsr=fs.readFileSync(new URL('../www/modules/dsr/index.html',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../www/etp-analytics-consumer.js',import.meta.url),'utf8');

function analytics(storeCode='WLMHW'){
  return Object.freeze({contractVersion:'ETP_E2_ANALYTICS_V1',scope:Object.freeze({storeCode}),view:'DAY',period:Object.freeze({}),verified:Object.freeze({}),coverage:Object.freeze({}),metrics:Object.freeze({}),mixes:Object.freeze({}),exceptions:Object.freeze({}),identity:Object.freeze({storeNet:100,croAchievement:80,unassigned:20,reconciles:true})});
}
const scope={storeCode:'WLMHW',financialYear:'2026-27',periodStart:'2026-04-01',periodEnd:'2027-03-31'};

test('consumer selects one exact store scope and requests only the sanitized analytics facade',async()=>{
  const calls=[],facade={listScopes(request){calls.push(['list',request]);return{ok:true,scopes:[{scope},{scope:{...scope,storeCode:'HEMW'}}]};},loadAnalytics(selected,request){calls.push(['load',selected,request]);return{ok:true,analytics:analytics()};}};
  const result=await consumer.load(facade,'WLMHW','2026-08-24','DAY');
  assert.equal(result.ok,true);assert.deepEqual(calls,[['list',{limit:20}],['load',scope,{view:'DAY',asOfDate:'2026-08-24'}]]);
  assert.equal(Object.isFrozen(result),true);
});

test('all-store, missing, ambiguous and cross-store responses fail closed',async()=>{
  let touched=0,facade={listScopes(){touched++;return{ok:true,scopes:[]};},loadAnalytics(){touched++;}};
  assert.equal((await consumer.load(facade,'ALL','2026-08-24','DAY')).code,'ETP_ANALYTICS_STORE_REQUIRED');assert.equal(touched,0);
  assert.equal((await consumer.load(facade,'WLMHW','2026-08-24','DAY')).code,'ETP_ANALYTICS_SCOPE_MISSING');
  facade={listScopes(){return{ok:true,scopes:[{scope},{scope}]};},loadAnalytics(){throw Error('must not load');}};
  assert.equal((await consumer.load(facade,'WLMHW','2026-08-24','DAY')).code,'ETP_ANALYTICS_SCOPE_AMBIGUOUS');
  facade={listScopes(){return{ok:true,scopes:[{scope}]};},loadAnalytics(){return{ok:true,analytics:analytics('HEMW')};}};
  assert.equal((await consumer.load(facade,'WLMHW','2026-08-24','DAY')).code,'ETP_ANALYTICS_RESPONSE_INVALID');
});

test('consumer enforces the permanent store-net identity and uses text-only DOM sinks',()=>{
  assert.equal(consumer.validate(analytics(), 'WLMHW'),true);
  assert.equal(consumer.validate({...analytics(),identity:{storeNet:101,croAchievement:80,unassigned:20,reconciles:true}},'WLMHW'),false);
  assert.match(source,/textContent=String/);assert.doesNotMatch(source,/innerHTML|readFacts|nativeStore|localStorage|postMessage/);
});

test('Home and DSR consume ETP analytics read-only without widening ETP ownership',()=>{
  assert.match(shell,/<script src="etp-analytics-consumer\.js"><\/script>/);
  assert.match(shell,/id="etpAnalyticsHome"/);assert.match(shell,/consumer\.load\(facade,selected&&selected\.isAll\?'':selected\.code,viewDate\(\),'DAY'\)/);
  assert.match(dsr,/<script src="\.\.\/\.\.\/etp-analytics-consumer\.js"><\/script>/);assert.match(dsr,/consumer\.load\(bridge&&bridge\.etpReadGateway,select\.value,todayStr\(\),'MTD'\)/);
  assert.match(shell,/navigateToModule\('etp'\)/);assert.doesNotMatch(shell.slice(shell.indexOf('<section class="view" id="configView"'),shell.indexOf('<section class="module-screen"')),/data-settings-(?:route|search)="[^"]*etp|Open Retail ETP/);
});
