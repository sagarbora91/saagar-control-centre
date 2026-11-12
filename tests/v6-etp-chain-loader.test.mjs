import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

// On-demand ETP operational chain (owner decision given in chat, 2026-11-12).
const require=createRequire(import.meta.url),manifest=require('../www/module-manifest.js');
const source=fs.readFileSync(new URL('../www/etp-chain-loader.js',import.meta.url),'utf8');
const shell=fs.readFileSync(new URL('../www/index.html',import.meta.url),'utf8');
const CHAIN=['etp-operational-foundation.js','etp-operational-store.js','etp-operational-adapters.js','etp-operational-runtime.js','etp-e4-authority-intake.js','etp-e6-authority-intake.js','etp-e5-authority-intake.js','etp-e7-authority-intake.js','etp-e7-service-verifier.js','etp-e7-service-operational.js','etp-cro-reconciliation.js','etp-e3-orchestrator.js','etp-e3-presentation.js','etp-target-planning.js','etp-e4-orchestrator.js','etp-e4-presentation.js','etp-e6-presentation.js','etp-e5-presentation.js','etp-e5-payroll-bridge.js','etp-operational-gateway.js','etp-operational-mount.js','etp-e3-verified-join.js','etp-operational-bootstrap.js','etp-operational-shell-composer.js','etp-incentive-control.js'];
const tick=()=>new Promise(resolve=>setImmediate(resolve));

// A fake window: injectEtp logs the name, resolves after a macrotask, and can reject the Nth call once.
function fakeRoot(options={}){
  const log=[],state={failAt:options.failAt===undefined?-1:options.failAt,failed:false,hang:options.hang===true};
  const root={log,state,document:{querySelector:()=>options.staticTag?{}:null},
    setTimeout:options.fakeTimers?(fn)=>{root.timerFn=fn;return 1;}:setTimeout,clearTimeout:options.fakeTimers?()=>{}:clearTimeout};
  if(options.injector!==false)root.__SaagarPdfLibs={injectEtp:src=>{log.push(src);if(state.hang)return new Promise(()=>{});return tick().then(()=>{if(state.failAt===log.length-1&&!state.failed){state.failed=true;throw new Error('Failed to load '+src);}});}};
  vm.runInNewContext(source,{window:root,Object,Promise,Error,setTimeout,clearTimeout},{filename:'etp-chain-loader.js'});
  return root;
}

test('concurrent ensure() callers share one load: 25 files, in order, each once; a later call loads nothing',async()=>{
  const root=fakeRoot(),loader=root.SaagarEtpChainLoader;
  assert.deepEqual({...loader.status()},{total:25,loaded:0,state:'idle'});
  const [a,b]=await Promise.all([loader.ensure(),loader.ensure()]);
  assert.deepEqual({...a},{ok:true});assert.deepEqual({...b},{ok:true});
  assert.deepEqual(root.log,CHAIN);
  assert.deepEqual({...loader.status()},{total:25,loaded:25,state:'ready'});
  assert.equal((await loader.ensure()).ok,true);
  assert.equal(root.log.length,25,'a ready loader injects nothing more');
});

test('a failed file is surfaced, the cursor stays on it, and the next call resumes there without repeating loaded files',async()=>{
  const root=fakeRoot({failAt:15}),loader=root.SaagarEtpChainLoader;
  const first=await loader.ensure();
  assert.deepEqual({...first},{ok:false,code:'ETP_CHAIN_LOAD_FAILED'});
  assert.deepEqual({...loader.status()},{total:25,loaded:15,state:'partial'});
  assert.equal(root.log.length,16);
  const second=await loader.ensure();
  assert.deepEqual({...second},{ok:true});
  assert.equal(root.log.length,26,'only the failed file is requested twice');
  assert.deepEqual([...new Set(root.log)],CHAIN);
  assert.equal(root.log.filter(name=>name===CHAIN[15]).length,2);
  assert.equal(root.log.filter(name=>name!==CHAIN[15]).length,24);
  assert.equal(loader.status().state,'ready');
});

test('a missing PDF-libs injector is reported, not thrown, and nothing is injected',async()=>{
  for(const mutate of [root=>{},root=>{root.__SaagarPdfLibs={ensure(){}};}]){
    const root=fakeRoot({injector:false});mutate(root);
    const out=await root.SaagarEtpChainLoader.ensure();
    assert.deepEqual({...out},{ok:false,code:'ETP_CHAIN_LOADER_UNAVAILABLE'});
    assert.equal(root.SaagarEtpChainLoader.status().loaded,0);
  }
});

test('a static foundation tag means the chain is already present and nothing is injected twice',async()=>{
  const root=fakeRoot({staticTag:true});
  assert.equal((await root.SaagarEtpChainLoader.ensure()).ok,true);
  assert.equal(root.log.length,0);
  assert.equal(root.SaagarEtpChainLoader.status().state,'ready');
});

test('a hung file gives the caller ETP_CHAIN_LOAD_TIMEOUT and a later caller joins the same run',async()=>{
  const root=fakeRoot({hang:true,fakeTimers:true}),loader=root.SaagarEtpChainLoader;
  const waiting=loader.ensure();
  await tick();root.timerFn();
  assert.deepEqual({...await waiting},{ok:false,code:'ETP_CHAIN_LOAD_TIMEOUT'});
  assert.equal(loader.status().state,'loading');
  const joined=loader.ensure();await tick();
  assert.equal(root.log.length,1,'the pending file is not injected a second time');
  root.timerFn();assert.equal((await joined).code,'ETP_CHAIN_LOAD_TIMEOUT');
});

test('the loader API is frozen, non-writable and not replaced by running the source again',()=>{
  const root=fakeRoot(),loader=root.SaagarEtpChainLoader,descriptor=Object.getOwnPropertyDescriptor(root,'SaagarEtpChainLoader');
  assert.equal(Object.isFrozen(loader),true);assert.deepEqual(Object.keys(loader).sort(),['ensure','status','version']);
  assert.equal(descriptor.writable,false);assert.equal(descriptor.configurable,false);
  vm.runInNewContext(source,{window:root,Object,Promise,Error,setTimeout,clearTimeout});
  assert.equal(root.SaagarEtpChainLoader,loader);
  assert.doesNotThrow(()=>vm.runInNewContext(source,{}),'loads in an empty context');
});

test('loader source: local etp-* names only, no script sink of its own, no chain identifiers',()=>{
  const names=[...source.matchAll(/^\s*'(etp-[a-z0-9-]+\.js)',?$/gm)].map(m=>m[1]);
  assert.deepEqual(names,CHAIN,'frozen chain order: foundation first, incentive-control last');
  assert.equal(new Set(names).size,25);
  for(const name of names){
    assert.match(name,/^etp-[a-z0-9-]+\.js$/);
    assert.ok(fs.existsSync(new URL('../www/'+name,import.meta.url)),name+' exists in www');
    assert.ok(manifest.getShared(name.replace(/\.js$/,'')),name+' is a hash-pinned shared asset');
  }
  assert.equal(names.includes('etp-operational-i18n.js'),false,'the ETP frame loads its own i18n copy');
  assert.doesNotMatch(source,/createElement|document\.write|\beval\b|new Function|import\s*\(|innerHTML|postMessage|\?\.|\?\?|localStorage|Capacitor|addEventListener|setInterval/);
  assert.doesNotMatch(source,/Saagar(?:EtpOperational|EtpE[3-7]|EtpCro|EtpTarget|EtpIncentive)\w*/);
  assert.equal(manifest.getShared('etp-chain-loader'),null,'the loader is deliberately not a module-manifest shared asset');
  assert.equal(manifest.sharedAssets.length,66);
});

test('shell wiring: one synchronous loader tag, the narrow injectEtp export, and no chain tag',()=>{
  assert.equal(shell.split('<script src="etp-chain-loader.js"></script>').length-1,1);
  for(const name of CHAIN)assert.equal(shell.includes(name),false,name+' is not named by the shell');
  assert.equal(shell.includes('etp-operational-i18n.js'),false);
  assert.equal(shell.split('injectEtp').length-1,1);
  const line=shell.split('\n').find(row=>row.includes('injectEtp'));
  assert.match(line,/^  window\.__SaagarPdfLibs = \{ ensure: ensure, ready: ready, injectEtp: function\(src\)\{ return \/\^etp-\[a-z0-9-\]\+\\\.js\$\/\.test\(String\(src\)\) \? injectOne\(src\) : Promise\.reject\(new Error\('Blocked script'\)\); \} \};$/);
  assert.doesNotMatch(line,/catch|throw|toast|fallback|return null|return false|return \[\]|return \{\}|createElement|document\.write|import\(/);
  const re=/^etp-[a-z0-9-]+\.js$/;
  for(const ok of CHAIN)assert.equal(re.test(ok),true);
  for(const bad of ['../etp-x.js','etp-x.js?y','http://h/etp-x.js','//h/etp-x.js','etp-x.js ','/etp-x.js','vendor/etp-x.js','app-i18n.js','etp-x.JS','etp-x.js\n'])assert.equal(re.test(bad),false,JSON.stringify(bad));
});

// The shell's real PDF-libs IIFE (index.html) + the real loader, against a fake DOM that fires load/error on append.
function shellInjectorWorld(failName){
  const start=shell.indexOf("<script>\n(function(){\n  'use strict';\n  // The exact files that used to be eager"),end=shell.indexOf('</script>',start);
  assert.ok(start>=0&&end>start,'PDF-libs IIFE located');
  const body=shell.slice(start+'<script>'.length,end),appended=[],tags=[];
  const document={querySelector:selector=>{const m=/data-saagar-pdf-lib="([^"]+)"/.exec(selector);return m?tags.find(t=>t.attrs['data-saagar-pdf-lib']===m[1]&&t.parentNode)||null:null;},documentElement:null,body:null};
  const parent={appendChild(tag){tag.parentNode=parent;tags.push(tag);appended.push(tag.src);setImmediate(()=>{if(tag.src===failName&&!document.failedOnce){document.failedOnce=true;tag.onerror();}else tag.onload();});},removeChild(tag){tag.parentNode=null;}};
  document.body=parent;document.documentElement=parent;
  document.createElement=name=>{assert.equal(name,'script');const attrs={};return{attrs,parentNode:null,setAttribute(k,v){attrs[k]=v;},getAttribute:k=>attrs[k]===undefined?null:attrs[k]};};
  const window={document,location:{href:'http://localhost/index.html'},setTimeout,clearTimeout};
  vm.runInNewContext(body,{window,document,setTimeout,Promise,Error,URL,location:window.location},{filename:'index.html#pdf-libs'});
  vm.runInNewContext(source,{window,Object,Promise,Error,setTimeout,clearTimeout},{filename:'etp-chain-loader.js'});
  return{window,appended};
}

test('through the shell injector: scripts are appended one at a time in order, once each; a failed file is retried alone', async()=>{
  const ok=shellInjectorWorld(null);
  assert.deepEqual({...await ok.window.SaagarEtpChainLoader.ensure()},{ok:true});
  assert.deepEqual(ok.appended,CHAIN);
  await ok.window.SaagarEtpChainLoader.ensure();
  assert.equal(ok.appended.length,25);

  const bad=shellInjectorWorld('etp-e4-presentation.js');
  assert.deepEqual({...await bad.window.SaagarEtpChainLoader.ensure()},{ok:false,code:'ETP_CHAIN_LOAD_FAILED'});
  assert.equal(bad.appended.length,16);
  assert.deepEqual({...await bad.window.SaagarEtpChainLoader.ensure()},{ok:true});
  assert.deepEqual([...new Set(bad.appended)],CHAIN);
  assert.equal(bad.appended.length,26);
});

test('the shell injectEtp export refuses anything that is not a flat local etp-*.js name', async()=>{
  const world=shellInjectorWorld(null),libs=world.window.__SaagarPdfLibs;
  assert.equal(typeof libs.injectEtp,'function');
  for(const bad of ['../etp-x.js','vendor/etp-x.js','http://h/etp-x.js','//h/etp-x.js','app-i18n.js','etp-x.js?y=1','jspdf.umd.min.js'])await assert.rejects(()=>libs.injectEtp(bad),/Blocked script/,bad);
  assert.equal(world.appended.length,0,'nothing is appended for a refused name');
  await libs.injectEtp('etp-operational-foundation.js');
  assert.deepEqual(world.appended,['etp-operational-foundation.js']);
});

test('MAH-4 inventories the on-demand chain honestly: one extra loader group, 25 literals, sink pins unchanged', async()=>{
  const {createMah4Profile}=await import('../scripts/lib/mah4-contract-source.mjs'),root=new URL('..',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),dynamic=createMah4Profile(root).scriptDiscovery.dynamicLocal;
  const group=dynamic.loaderGroups.find(item=>item.id==='shell-etp-chain');
  assert.ok(group,'shell-etp-chain group present while the loader file exists');
  assert.equal(group.owner,'www/etp-chain-loader.js');assert.equal(group.trigger,'on-demand-etp-verified-scope');
  assert.deepEqual(group.coreAssetPaths,CHAIN.map(name=>'www/'+name));
  assert.deepEqual(Object.values(group.literalCounts),Array(25).fill(1));
  assert.equal(dynamic.loaderGroupCount,6);assert.equal(dynamic.scriptRouteCount,10+25);assert.equal(dynamic.scriptLiteralReferenceCount,12+25);
  assert.equal(dynamic.injectionSinks.createElementScript,5);assert.equal(dynamic.injectionSinks.documentWriteScript,2);assert.equal(dynamic.injectionSinks.dynamicImport,0);
  assert.deepEqual(dynamic.injectionSinks.createElementSites,{'www/index.html':4,'www/saagar-report.js':1});
  assert.deepEqual(dynamic.directScriptOverlap,[]);
});
