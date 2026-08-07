import test from 'node:test';import assert from 'node:assert/strict';import{createRequire}from'node:module';const require=createRequire(import.meta.url);const P=require('../www/c1-operations-policy.js');
test('C1 readiness names every missing required control',()=>assert.deepEqual(P.readiness([{label:'A',done:true},{label:'B',done:false}]),{ok:false,total:2,done:1,missing:['B']}));
test('D6 udhaar ageing is deterministic and ranked oldest first',()=>assert.deepEqual(P.ageing([{id:'a',amount:10,dueDate:'2026-07-01'},{id:'b',balance:20,due:'2026-08-01'}],'2026-08-04').map(x=>[x.id,x.ageDays,x.bucket]),[['a',34,'31-60'],['b',3,'0-7']]));
test('D7 month variance handles a zero comparison safely',()=>{assert.equal(P.monthVariance(120,100).pct,20);assert.equal(P.monthVariance(1,0).pct,null);});
test('D8 coverage reports exact shortfall',()=>assert.deepEqual(P.coverage(5,3,3),{active:5,away:3,available:2,minimum:3,ok:false,shortfall:1}));
test('D9 readiness requires all four filing controls',()=>{assert.equal(P.taxReadiness({ledger:true,rates:true,evidence:true,review:true}).ok,true);assert.equal(P.taxReadiness({}).missing.length,4);});
test('D10 coaching stays human-reviewed and deterministic',()=>assert.deepEqual(P.coaching([{pct:90},{score:70}]),{count:2,average:80,lowest:70,followups:1}));
test('D11 forecast reports variance and attainment',()=>assert.deepEqual(P.forecast(100,90),{forecast:100,actual:90,variance:-10,attainment:90}));
