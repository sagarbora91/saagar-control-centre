// Decode the 10 embedded module HTML blobs (MODULES[].html_b64) from www/index.html
// into clean per-module files outside the repo, for defect auditing.
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const OUT = path.join(ROOT, '..', '_extracted_modules');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const txt = fs.readFileSync(path.join(ROOT, 'www', 'index.html'), 'utf8');

const ids = [...txt.matchAll(/"id"\s*:\s*"([a-z_]+)"/g)].map(m => ({ id: m[1], i: m.index }));
const blobs = [...txt.matchAll(/"html_b64"\s*:\s*"([A-Za-z0-9+/=]{200,})"/g)].map(m => ({ b64: m[1], i: m.index }));

const results = [];
for (const b of blobs) {
  let best = null;
  for (const id of ids) { if (id.i < b.i && (!best || id.i > best.i)) best = id; }
  const id = best ? best.id : ('mod_' + b.i);
  let html = '';
  try { html = Buffer.from(b.b64, 'base64').toString('utf8'); } catch (e) { html = ''; }
  fs.writeFileSync(path.join(OUT, id + '.html'), html);
  results.push({ id, bytes: html.length });
}
console.log('Output dir:', OUT);
console.log('Extracted ' + results.length + ' modules:');
results.forEach(r => console.log('  ' + r.id + '  ' + r.bytes + ' bytes'));
