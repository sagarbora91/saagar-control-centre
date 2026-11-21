import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'www','modules','qms');
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const css=fs.readFileSync(path.join(dir,'qms-ui.css'),'utf8');
const view=fs.readFileSync(path.join(dir,'qms-view.js'),'utf8');

test('QMS adopts the frozen auto-width foundation and has no module presentation style block',()=>{
  for(const asset of ['module-brand-tokens.css','module-responsive.css','module-components.css','module-table.css','module-ui-runtime.js','module-table-runtime.js','module-rendered-components.js'])assert.match(html,new RegExp(asset.replace('.','\\.')));
  assert.match(html,/<body data-saagar-ui data-saagar-width="auto" data-saagar-width-resolved="mobile">/);
  assert.match(html,/SaagarUiFoundation\.configure\(document\.body,\{mode:'auto'\}\)/);
  assert.match(html,/<link id="phase6g-qms-ui-css" rel="stylesheet" href="qms-ui\.css">/);
  assert.doesNotMatch(html,/<style(?:\s|>)(?![^>]*id="(?:st-v5-mobile-css-delta|st-v5-hide-css)")/);
});

test('QMS exposes ten live tables plus the live queue as eleven explicit responsive workflows',()=>{
  const context={globalThis:null};context.globalThis=context;vm.createContext(context);vm.runInContext(view,context);
  const models=context.SaagarQmsView.tableModels;
  assert.equal(Object.keys(models).length,10);
  assert.deepEqual([...new Set(Object.values(models).map(model=>model.strategy))].sort(),['cards','grid']);
  assert.match(view,/qms-live-queue/);
  assert.match(view,/data-saagar-rendered-strategy','priority/);
});

test('QMS CSS supplies bounded API-23 card labels, grid overflow and reachable touch controls',()=>{
  assert.match(css,/html,body\{max-width:100%;overflow-x:hidden\}/);
  assert.match(css,/table\[data-saagar-table-strategy="grid"\]\{min-width:680px\}/);
  assert.match(css,/td::before\{content:attr\(data-label\)/);
  assert.match(css,/@media\(max-width:767px\)/);
  assert.match(css,/min-height:44px/);
  assert.doesNotMatch(css,/@container|:has\(|\bsubgrid\b/);
});
