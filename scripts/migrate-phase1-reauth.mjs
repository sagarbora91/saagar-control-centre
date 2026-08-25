#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModuleManifestSource, renderModuleManifestSource } from './lib/module-manifest-source.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ids=['dsr','expense','payroll','stock'];
const expression=/function\s+stReauth\s*\(label\)\s*\{[\s\S]*?\n\}/;
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
for(const id of ids){const file=path.join(root,'www/modules',id,'index.html');let source=fs.readFileSync(file,'utf8');if(!expression.test(source))throw new Error(`Missing stReauth: ${id}`);source=source.replace(expression,'const stReauth=SaagarModuleRuntime.reauth;');fs.writeFileSync(file,source,'utf8');}
const snapshot=readModuleManifestSource(root);for(const module of snapshot.data.modules){const bytes=fs.readFileSync(path.join(root,'www',module.file));module.bytes=bytes.length;module.sha256=sha256(bytes);}const runtime=fs.readFileSync(path.join(root,'www/shared/module-runtime.js'));const entry=snapshot.data.sharedAssets.find(item=>item.id==='module-runtime');entry.bytes=runtime.length;entry.sha256=sha256(runtime);fs.writeFileSync(snapshot.filePath,renderModuleManifestSource(snapshot,snapshot.data),'utf8');
process.stdout.write(`${JSON.stringify({modules:ids})}\n`);
