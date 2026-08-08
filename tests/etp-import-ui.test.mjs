import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const api=require('../www/etp-import-ui.js');
const source=fs.readFileSync(new URL('../www/etp-import-ui.js',import.meta.url),'utf8');
const shell=fs.readFileSync(new URL('../www/index.html',import.meta.url),'utf8');

function ready(ui){ui.setScope('storeCode','HEMW');ui.setScope('financialYear','2026-27');ui.setScope('periodStart','2026-04-01');ui.setScope('periodEnd','2026-04-30');for(const id of api.REPORTS)ui.setFile(id,{name:id+'.xlsx'});}

test('UI requires one exact file for all four reports and fails closed without runtime',async()=>{
  const ui=api.create();
  assert.deepEqual(api.REPORTS,['R003','R013','R022','R025']);
  assert.equal((await ui.start()).code,'ETP_SELECTION_INCOMPLETE');
  ready(ui);delete globalThis.SaagarEtpImportRuntime;
  assert.equal((await ui.start()).code,'ETP_RUNTIME_UNAVAILABLE');
});

test('scope registry is written only after verified publication',async()=>{
  const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
  globalThis.SaagarEtpImportRuntime={
    run:async()=>({ok:true,awaitingConfirmation:true,lifecycle:{state:'AWAITING_CONFIRMATION'}}),
    confirm:async()=>({ok:true,lifecycle:{state:'ACCEPTED'}})
  };
  const ui=api.create();ready(ui);
  assert.equal((await ui.start()).awaitingConfirmation,true);
  assert.equal(values.has(api.REGISTRY_KEY),false);
  await ui.confirm();
  assert.deepEqual(JSON.parse(values.get(api.REGISTRY_KEY)),[{scopeKey:'HEMW|2026-27|2026-04-01..2026-04-30'}]);
});

test('responsive source has a desktop overview and mobile stacked controls with no business totals',()=>{
  assert.match(source,/grid-template-columns:230px minmax\(0,850px\)/);
  assert.match(source,/@media\(max-width:699px\)/);
  assert.match(source,/\.etp-grid,\.etp-files\{grid-template-columns:1fr\}/);
  assert.match(source,/No sales totals are shown here/);
  assert.doesNotMatch(source,/₹|salesTotal|revenueTotal/);
});

test('shell exposes the dedicated ETP route and loads its external module',()=>{
  assert.match(shell,/<script src="etp-import-ui\.js"><\/script>/);
  assert.match(shell,/Open ETP import/);
  assert.match(shell,/SaagarEtpImportUi\.open/);
});
