#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const www = path.join(root, 'www');
const moduleFiles = fs.readdirSync(path.join(www, 'modules')).map(id => path.join(www, 'modules', id, 'index.html'));
const files = [path.join(www, 'index.html'), ...moduleFiles, path.join(www, 'shared', 'module-runtime.js')];

function replaceWildcardTargets(source, relative) {
  let replacements = 0;
  const output = source.replace(/(postMessage\s*\([\s\S]{0,1600}?),\s*(['"])\*\2\s*\)/g, (whole, prefix) => {
    if (prefix.includes('</script>') || prefix.includes('<script') && prefix.lastIndexOf('<script') < prefix.lastIndexOf('</script>')) return whole;
    replacements++;
    return `${prefix},SaagarModuleRuntime.targetOrigin)`;
  });
  let hardened = output;
  if (relative === 'shared/module-runtime.js') {
    hardened = hardened.replace("window.addEventListener('message',function(e){if(!e||!e.data)return;", "window.addEventListener('message',function(e){if(!accepts(e,window.parent)||!e.data)return;");
  } else if (relative === 'index.html') {
    hardened = hardened.replace("window.addEventListener('message', e => {\n  if(!e || !e.data) return;", "window.addEventListener('message', e => {\n  if(!e || !e.data || e.origin!==window.location.origin) return;");
  } else {
    hardened = hardened.replaceAll("if(event&&event.source===window.parent&&event.data&&event.data.type==='ST_ACCESS_CONTEXT')", "if(SaagarModuleRuntime.accepts(event,window.parent)&&event.data&&event.data.type==='ST_ACCESS_CONTEXT')");
  }
  return { output: hardened, replacements };
}

const rows = [];
for (const file of files) {
  const relative = path.relative(www, file).replaceAll('\\', '/');
  let source = fs.readFileSync(file, 'utf8');
  if (relative === 'index.html' && !source.includes('<script src="shared/module-runtime.js"></script>')) {
    source = source.replace('<script src="shared/mah4-runtime.js"></script>', '<script src="shared/module-runtime.js"></script>\n<script src="shared/mah4-runtime.js"></script>');
  }
  const result = replaceWildcardTargets(source, relative);
  fs.writeFileSync(file, result.output, 'utf8');
  rows.push({ file: relative, replacements: result.replacements });
}

process.stdout.write(`${JSON.stringify(rows)}\n`);
