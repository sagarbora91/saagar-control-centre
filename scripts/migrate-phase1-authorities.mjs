#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModuleManifestSource, renderModuleManifestSource } from './lib/module-manifest-source.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const runtimePath=path.join(root,'www/shared/module-runtime.js');let runtime=fs.readFileSync(runtimePath,'utf8');
runtime=runtime.replace("employees:function(c){var KEY='saagar_employee_master_v1',CKEY='saagar_master_customers'","employees:function(c){var employeeKey='saagar_employee_master_v1',customerKey='saagar_master_customers'");
runtime=runtime.replaceAll('localStorage.getItem(KEY)','localStorage.getItem(employeeKey)').replaceAll('localStorage.getItem(CKEY)','localStorage.getItem(customerKey)');
fs.writeFileSync(runtimePath,runtime,'utf8');
const expensePath=path.join(root,'www/modules/expense/index.html');let expense=fs.readFileSync(expensePath,'utf8');expense=expense.replaceAll('ADMIN_MODE_KEY','adminModeKey');fs.writeFileSync(expensePath,expense,'utf8');
const snapshot=readModuleManifestSource(root);for(const module of snapshot.data.modules){const bytes=fs.readFileSync(path.join(root,'www',module.file));module.bytes=bytes.length;module.sha256=sha256(bytes);}const bytes=fs.readFileSync(runtimePath);const entry=snapshot.data.sharedAssets.find(item=>item.id==='module-runtime');entry.bytes=bytes.length;entry.sha256=sha256(bytes);fs.writeFileSync(snapshot.filePath,renderModuleManifestSource(snapshot,snapshot.data),'utf8');
process.stdout.write(`${JSON.stringify({runtime:true,expense:true})}\n`);
