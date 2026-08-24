import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const moduleDir=path.join(root,'www','modules','qms');
const html=fs.readFileSync(path.join(moduleDir,'index.html'),'utf8');
const view=fs.readFileSync(path.join(moduleDir,'qms-view.js'),'utf8');

test('QMS presentation policy is external, frozen and reached through one thin render wrapper',()=>{
  assert.match(html,/<script src="qms-view\.js"><\/script>/);
  assert.match(html,/function qmsRenderPresentation\(\)\{return SaagarQmsView\.decorate\(document\.body\)\}/);
  assert.match(html,/applyReadOnly\(\);qmsRenderPresentation\(\)\}/);
  const context={globalThis:null};context.globalThis=context;vm.createContext(context);vm.runInContext(view,context);
  assert.equal(context.SaagarQmsView.version,1);
  assert.equal(Object.isFrozen(context.SaagarQmsView),true);
  assert.equal(Object.isFrozen(context.SaagarQmsView.tableModels),true);
  assert.equal(Object.keys(context.SaagarQmsView.tableModels).length,10);
});

test('QMS state, allocation and persistence authorities remain inline while policy adapters remain external',()=>{
  for(const name of ['save','addAudit','nextQueueNo','allocateCustomer','confirmSkip','closeEOD'])assert.match(html,new RegExp(`function ${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\(`));
  assert.doesNotMatch(view,/localStorage\.(?:setItem|removeItem)|\bstate(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])?\s*=|\bqueueSeq(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])?\s*=/);
  assert.doesNotMatch(view,/qmsPolicyApi|qmsPersistenceApi|allocateByRotation|confirmSkip|closeEOD/);
  const policy=fs.readFileSync(path.join(root,'www','qms-policy.js'));
  const persistence=fs.readFileSync(path.join(root,'www','qms-persistence.js'));
  assert.equal(crypto.createHash('sha256').update(policy).digest('hex'),'565cd870cfaca51d62aaff83e697dff30c8747250624d76913d559a36701a444');
  assert.equal(crypto.createHash('sha256').update(persistence).digest('hex'),'a4140eeab246ef1edba0d7db7b182fa174f51d90474f138159f259bf23568c14');
});

test('QMS keeps the frozen 13 static and 72 generated control identity inventory',()=>{
  const staticSource=html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
  assert.equal((staticSource.match(/\bdata-action="/g)||[]).length,13);
  let generated=0;
  for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi))generated+=(script[1].match(/<(?:button|input|select)\b[^>]*\bdata-action="/gi)||[]).length;
  assert.equal(generated,72);
});
