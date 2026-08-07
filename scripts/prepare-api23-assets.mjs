import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { transformSync } from '@babel/core';

const root = path.resolve(import.meta.dirname, '..');
const publicDir = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'public');
const androidAssetsDir = path.dirname(publicDir);
const sourceDir = path.join(root, 'www');
const require = createRequire(import.meta.url);
const manifest = require(path.join(sourceDir, 'module-manifest.js'));

const POLYFILLS = `(function(){'use strict';
if(typeof window.globalThis==='undefined')window.globalThis=window;
if(!Array.from)Array.from=function(x){return Array.prototype.slice.call(x);};
if(!Array.prototype.includes)Array.prototype.includes=function(x,n){return this.indexOf(x,n||0)!==-1;};
if(!Array.prototype.find)Array.prototype.find=function(fn,t){for(var i=0;i<this.length;i++)if(fn.call(t,this[i],i,this))return this[i];};
if(!Array.prototype.findIndex)Array.prototype.findIndex=function(fn,t){for(var i=0;i<this.length;i++)if(fn.call(t,this[i],i,this))return i;return -1;};
if(!Array.prototype.flatMap)Array.prototype.flatMap=function(fn,t){return Array.prototype.concat.apply([],this.map(fn,t));};
if(!String.prototype.includes)String.prototype.includes=function(x,n){return this.indexOf(x,n||0)!==-1;};
if(!String.prototype.startsWith)String.prototype.startsWith=function(x,n){return this.substr(n||0,x.length)===x;};
if(!String.prototype.endsWith)String.prototype.endsWith=function(x,n){var p=n===undefined?this.length:n;return this.substring(p-x.length,p)===x;};
if(!String.prototype.padStart)String.prototype.padStart=function(n,p){p=String(p===undefined?' ':p);var s=String(this);while(s.length<n)s=p+s;return s.slice(-n);};
if(!Object.entries)Object.entries=function(o){return Object.keys(o).map(function(k){return[k,o[k]];});};
if(!Object.values)Object.values=function(o){return Object.keys(o).map(function(k){return o[k];});};
if(!Object.fromEntries)Object.fromEntries=function(xs){var o={};xs.forEach(function(x){o[x[0]]=x[1];});return o;};
if(!Object.assign)Object.assign=function(t){if(t==null)throw new TypeError('Object.assign target');for(var i=1;i<arguments.length;i++){var s=arguments[i];if(s!=null)Object.keys(Object(s)).forEach(function(k){t[k]=s[k];});}return t;};
if(!Number.isFinite)Number.isFinite=function(x){return typeof x==='number'&&isFinite(x);};
if(!Number.isInteger)Number.isInteger=function(x){return Number.isFinite(x)&&Math.floor(x)===x;};
if(window.NodeList&&!NodeList.prototype.forEach)NodeList.prototype.forEach=Array.prototype.forEach;
if(window.HTMLCollection&&!HTMLCollection.prototype.forEach)HTMLCollection.prototype.forEach=Array.prototype.forEach;
})();`;

function babel(source, filename) {
  return transformSync(source, {
    filename,
    sourceType: 'script',
    presets: [['@babel/preset-env', { targets: { chrome: '44' }, bugfixes: true, modules: false }]],
    comments: false,
    compact: false,
    sourceMaps: false
  }).code;
}

function transformHtml(source, filename) {
  let count = 0;
  const transformed = source.replace(/<!--[\s\S]*?-->|<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi, (whole, attrs, body) => {
    if (whole.startsWith('<!--')) return whole;
    if (/\btype\s*=\s*["'](?:application\/json|text\/template)["']/i.test(attrs) || !body.trim()) return whole;
    count += 1;
    return `<script${attrs}>\n${babel(body, `${filename}#inline-${count}`)}\n</script>`;
  });
  return transformed
    .replace(/x=>x\.checked=true/g, 'function(x){x.checked=true;}')
    .replace(/<head([^>]*)>/i, `<head$1>\n<script>${POLYFILLS}</script>`);
}

function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

if (!fs.existsSync(publicDir)) throw new Error('Generated Android public assets are missing; run capacitor sync first');

// Capacitor injects this asset before the document executes. Capacitor 6 ships
// modern syntax even though Android still permits API 23, so the bridge must be
// down-levelled alongside the application or native plugins silently disappear.
const bridgeSource = path.join(root, 'node_modules', '@capacitor', 'android', 'capacitor', 'src', 'main', 'assets', 'native-bridge.js');
fs.writeFileSync(
  path.join(androidAssetsDir, 'native-bridge.js'),
  babel(fs.readFileSync(bridgeSource, 'utf8'), bridgeSource),
  'utf8'
);

const manifestPath = path.join(publicDir, 'module-manifest.js');
const deferred = new Set([manifestPath]);
for (const file of filesUnder(publicDir)) {
  if (deferred.has(file)) continue;
  const ext = path.extname(file).toLowerCase();
  if (ext === '.js') fs.writeFileSync(file, babel(fs.readFileSync(file, 'utf8'), file), 'utf8');
  if (ext === '.html') fs.writeFileSync(file, transformHtml(fs.readFileSync(file, 'utf8'), file), 'utf8');
}

let generatedManifest = fs.readFileSync(manifestPath, 'utf8');
const pinned = [...manifest.modules, ...manifest.sharedAssets];
for (const item of pinned) {
  const transformedPath = path.join(publicDir, item.file.replace(/\//g, path.sep));
  const bytes = fs.readFileSync(transformedPath);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  generatedManifest = generatedManifest.replace(`bytes: ${item.bytes}`, `bytes: ${bytes.length}`);
  generatedManifest = generatedManifest.replace(`sha256: '${item.sha256}'`, `sha256: '${hash}'`);
}
fs.writeFileSync(manifestPath, babel(generatedManifest, manifestPath), 'utf8');
process.stdout.write(`[api23] prepared ${filesUnder(publicDir).length} Android assets for Chrome 44\n`);
