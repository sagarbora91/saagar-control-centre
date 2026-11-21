#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const uses=new Map();
for(const id of fs.readdirSync(path.join(root,'www/modules'))){const source=fs.readFileSync(path.join(root,'www/modules',id,'index.html'),'utf8');for(const match of source.matchAll(/(['"])((?:saagar|st|gm)_[A-Za-z0-9_.:-]{2,})\1/gi)){if(!uses.has(match[2]))uses.set(match[2],new Set());uses.get(match[2]).add(id);}}
for(const [value,modules] of [...uses].filter(([,set])=>set.size>=2).sort()){const hash=crypto.createHash('sha256').update(value).digest('hex').slice(0,20);process.stdout.write(`${JSON.stringify({conceptId:`storage:${hash}`,value,modules:[...modules]})}\n`);}
