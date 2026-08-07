#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ids = ['stock','service','expense','grooming','cro_audit','payroll','leave','tax'];
const body = "(function(){var nativeSet=localStorage.setItem.bind(localStorage),nativeRemove=localStorage.removeItem.bind(localStorage),sending=false;function emit(action,key,before,after){if(sending)return;try{sending=true;if(window.SaagarMah4&&window.SaagarMah4.audit)window.SaagarMah4.audit(action,String(key),before,after)}catch(e){}finally{sending=false}}localStorage.setItem=function(key,value){var before=null;try{before=localStorage.getItem(key)}catch(e){}var result=nativeSet(key,value);emit('module.storage.set',String(key),before,String(value));return result};localStorage.removeItem=function(key){var before=null;try{before=localStorage.getItem(key)}catch(e){}var result=nativeRemove(key);emit('module.storage.remove',String(key),before,null);return result};})();";
for (const id of ids) {
  const file = path.join(root, 'www', 'modules', id, 'index.html');
  const source = fs.readFileSync(file, 'utf8');
  const expression = /(<script\b[^>]*id=["']st-v5-module-audit-bridge["'][^>]*>)[\s\S]*?(<\/script>)/i;
  if (!expression.test(source)) throw new Error(`Missing audit bridge: ${id}`);
  fs.writeFileSync(file, source.replace(expression, `$1${body}$2`), 'utf8');
}
process.stdout.write(`${JSON.stringify({ migrated: ids.length })}\n`);
