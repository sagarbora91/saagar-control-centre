#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const www = path.join(root, 'www');
const host = '127.0.0.1';
const port = Number(process.argv.find(value => value.startsWith('--port='))?.slice(7) || 8767);
const legacyLink = '<link id="st-v5-mobile-css" rel="stylesheet" href="../../shared/module-mobile-legacy.css">';
const legacyBody = fs.readFileSync(path.join(www, 'shared', 'module-mobile-legacy.css'), 'utf8');

function type(file) {
  return ({ '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript' })[path.extname(file)] || 'application/octet-stream';
}

http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${host}`);
  const match = url.pathname.match(/^\/(current|baseline)\/(.*)$/);
  if (!match || match[2].split('/').some(part => part === '..')) {
    res.writeHead(404).end('Not found');
    return;
  }
  const relative = match[2] || 'index.html';
  const file = path.resolve(www, relative);
  if (!file.startsWith(`${www}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  let body = fs.readFileSync(file);
  if (match[1] === 'baseline' && relative === 'modules/planning/index.html') {
    const html = body.toString('utf8');
    if (!html.includes(legacyLink)) throw new Error('Planning legacy link missing');
    body = Buffer.from(html.replace(legacyLink, `<style id="st-v5-mobile-css">${legacyBody}</style>`));
  }
  res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': `${type(file)}; charset=utf-8` });
  res.end(body);
}).listen(port, host, () => process.stdout.write(`Phase 6C Planning visual server http://${host}:${port}\n`));
