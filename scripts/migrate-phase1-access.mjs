#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModuleManifestSource, renderModuleManifestSource } from './lib/module-manifest-source.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const configs={
  stock:"{schemaVersion:1,moduleId:'stock',nextSteps:[],customerSelectors:[],accessContext:true}",
  service:"{schemaVersion:1,moduleId:'service',nextSteps:[{id:'qms',label:'Back to Queue →'}],customerSelectors:['#f-cn','#f-an','#f-dcs'],accessContext:true}",
  dsr:"{schemaVersion:1,moduleId:'dsr',nextSteps:[{id:'stock',label:'Update Stock →'}],customerSelectors:[],accessContext:true}",
  expense:"{schemaVersion:1,moduleId:'expense',nextSteps:[{id:'tax',label:'Check Tax →'}],customerSelectors:[],accessContext:true}"
};
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
for(const [moduleId,config] of Object.entries(configs)){
  const file=path.join(root,'www/modules',moduleId,'index.html');
  let source=fs.readFileSync(file,'utf8');
  const expression=/<script\b[^>]*id=["']st-v5-module-access-bridge["'][^>]*>[\s\S]*?<\/script>/i;
  if(!expression.test(source))throw new Error(`Missing access bridge: ${moduleId}`);
  source=source.replace(expression,`<script id="st-v5-module-access-bridge">SaagarModuleRuntime.run('access',${config});</script>`);
  fs.writeFileSync(file,source,'utf8');
}
const snapshot=readModuleManifestSource(root);
for(const module of snapshot.data.modules){const bytes=fs.readFileSync(path.join(root,'www',module.file));module.bytes=bytes.length;module.sha256=sha256(bytes);}
const runtime=fs.readFileSync(path.join(root,'www/shared/module-runtime.js'));const entry=snapshot.data.sharedAssets.find(item=>item.id==='module-runtime');entry.bytes=runtime.length;entry.sha256=sha256(runtime);
fs.writeFileSync(snapshot.filePath,renderModuleManifestSource(snapshot,snapshot.data),'utf8');
process.stdout.write(`${JSON.stringify({modules:Object.keys(configs)})}\n`);
