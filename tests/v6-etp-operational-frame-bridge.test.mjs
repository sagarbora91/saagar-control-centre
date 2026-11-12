import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../www/etp-operational-frame-bridge.js',import.meta.url),'utf8');

test('binds the real parent privately and forwards only roots and scope provider',async()=>{let received;const parent={SaagarEtpOperationalShellComposer:{compose:value=>{received=value;return Promise.resolve({ok:true});}}},window={parent};vm.runInNewContext(source,{window,Object,Promise});const roots={e3:{},e4:{}},getScope=()=>({});assert.equal((await window.SaagarEtpOperationalFrameBridge.compose({roots,getScope})).ok,true);assert.equal(received.root,parent);assert.equal(received.roots,roots);assert.equal(received.getScope,getScope);assert.deepEqual(Object.keys(window.SaagarEtpOperationalFrameBridge).sort(),['compose','version']);});

test('fails closed when parent composer is absent and exports no parent handle',async()=>{const window={};window.parent={};vm.runInNewContext(source,{window,Object,Promise});const out=await window.SaagarEtpOperationalFrameBridge.compose({});assert.equal(out.code,'ETP_FRAME_COMPOSER_UNAVAILABLE');assert.equal('parent' in window.SaagarEtpOperationalFrameBridge,false);assert.equal(Object.isFrozen(window.SaagarEtpOperationalFrameBridge),true);});

// On-demand chain (owner decision given in chat, 2026-11-12): the bridge awaits the parent loader, and only after a verified scope exists.
// The fake composer appears on the parent only once ensure() has run, like the real chain.
function withLoader(ensure,{loader=true}={}){const log=[],parent={},window={parent};const installComposer=()=>{parent.SaagarEtpOperationalShellComposer={compose:value=>{log.push('compose');return Promise.resolve({ok:true,seen:value});}};};if(loader)parent.SaagarEtpChainLoader={ensure:()=>{log.push('ensure');return ensure().then(r=>{if(r&&r.ok===true)installComposer();return r;});}};else installComposer();vm.runInNewContext(source,{window,Object,Promise});return{parent,log,bridge:window.SaagarEtpOperationalFrameBridge};}

test('awaits the on-demand chain loader once, then calls the composer, when a scope exists',async()=>{const ctx=withLoader(()=>Promise.resolve({ok:true})),roots={e3:{}},getScope=()=>({a:1}),out=await ctx.bridge.compose({roots,getScope});assert.equal(out.ok,true);assert.deepEqual(ctx.log,['ensure','compose']);assert.equal(out.seen.root,ctx.parent);assert.equal(out.seen.roots,roots);assert.equal(out.seen.getScope,getScope);});

test('does not load the chain when no scope is selected, the scope provider throws, or none is given',async()=>{for(const getScope of [()=>null,()=>{throw new Error('x');},undefined]){const ctx=withLoader(()=>Promise.resolve({ok:true}));const out=await ctx.bridge.compose({roots:{},getScope});assert.equal(ctx.log.includes('ensure'),false);assert.equal(out.code,'ETP_FRAME_COMPOSER_UNAVAILABLE');}});

test('a failed or rejected chain load is reported as ETP_OPERATIONAL_LOAD_FAILED and never composes',async()=>{for(const ensure of [()=>Promise.resolve({ok:false,code:'X'}),()=>Promise.resolve(null),()=>Promise.reject(new Error('no'))]){const ctx=withLoader(ensure);const out=await ctx.bridge.compose({roots:{},getScope:()=>({a:1})});assert.deepEqual({ok:out.ok,code:out.code},{ok:false,code:'ETP_OPERATIONAL_LOAD_FAILED'});assert.deepEqual(ctx.log,['ensure']);assert.equal(Object.isFrozen(out),true);}});

test('with the loader absent the bridge behaves as before and still exports no parent handle',async()=>{const ctx=withLoader(()=>Promise.resolve({ok:true}),{loader:false});const out=await ctx.bridge.compose({roots:{},getScope:()=>({a:1})});assert.equal(out.ok,true);assert.deepEqual(ctx.log,['compose']);assert.deepEqual(Object.keys(ctx.bridge).sort(),['compose','version']);assert.equal('parent' in ctx.bridge,false);assert.equal(Object.isFrozen(ctx.bridge),true);assert.doesNotMatch(source,/innerHTML|Capacitor|postMessage|fetch\(|\?\.|\?\?/);});
