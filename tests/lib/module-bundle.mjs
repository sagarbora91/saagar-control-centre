import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(here, '../../www/index.html');

export function loadModuleBundle() {
  const index = fs.readFileSync(indexPath, 'utf8');
  const match = index.match(/\bconst\s+MODULES\s*=\s*(\[[\s\S]*?\])\s*;\s*(?:\r?\n)/);
  if (!match) throw new Error('MODULES bundle not found');
  return JSON.parse(match[1]).map(module => {
    const bytes = Buffer.from(module.html_b64, 'base64');
    return {
      ...module,
      html: bytes.toString('utf8'),
      actualBytes: bytes.length,
      actualSha256: crypto.createHash('sha256').update(bytes).digest('hex')
    };
  });
}

export function inlineModuleScripts(html) {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  const out = [];
  for (const match of withoutComments.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = match[1] || '';
    if (/\bsrc\s*=/.test(attrs)) continue;
    const type = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() || '';
    if (type && !/(?:java|ecma)script|module/.test(type)) continue;
    out.push(match[2]);
  }
  return out;
}
