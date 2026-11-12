// Test helper for group S11 (tax module). Extracts named functions from the real
// www/modules/tax/index.html and runs them in a fresh vm context (a different realm).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
export const TAX_HTML = path.join(ROOT, 'www', 'modules', 'tax', 'index.html');
export const TAX_CSS = path.join(ROOT, 'www', 'modules', 'tax', 'tax-ui.css');

export function readTax() { return fs.readFileSync(TAX_HTML, 'utf8'); }

const BS = String.fromCharCode(92);
const REGEX_PREV = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);

// Returns the index just after the matching close brace of the block opening at src[open] === '{'.
function matchBlock(src, open) {
  let i = open, depth = 0, prevSig = '{';
  const n = src.length;
  function skipString(q) {
    i++;
    while (i < n && src[i] !== q) { if (src[i] === BS) i++; i++; }
    i++;
  }
  function skipTemplate() {
    i++;
    while (i < n && src[i] !== '`') {
      if (src[i] === BS) { i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') { i = matchBlock(src, i + 1); continue; }
      i++;
    }
    i++;
  }
  while (i < n) {
    const c = src[i];
    if (c === '{') { depth++; i++; prevSig = '{'; continue; }
    if (c === '}') { depth--; i++; prevSig = '}'; if (depth === 0) return i; continue; }
    if (c === '"' || c === "'") { skipString(c); prevSig = 'a'; continue; }
    if (c === '`') { skipTemplate(); prevSig = 'a'; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 2; continue; }
    if (c === '/') {
      let isRegex = REGEX_PREV.has(prevSig);
      if (!isRegex) {
        const back = src.slice(Math.max(0, i - 8), i).trimEnd();
        if (/(?:^|[^\w$])return$/.test(back)) isRegex = true;
      }
      if (isRegex) {
        i++;
        let inClass = false;
        while (i < n) {
          const d = src[i];
          if (d === BS) { i += 2; continue; }
          if (d === '[') inClass = true;
          else if (d === ']') inClass = false;
          else if (d === '/' && !inClass) break;
          i++;
        }
        i++;
        while (/[a-z]/i.test(src[i] || '')) i++;
        prevSig = 'a';
        continue;
      }
      i++; prevSig = '/'; continue;
    }
    if (!/\s/.test(c)) prevSig = /[\w$]/.test(c) ? 'a' : c;
    i++;
  }
  throw new Error('unbalanced braces');
}

export function extractFunction(src, name) {
  const re = new RegExp('(?:^|\\n)((?:async\\s+)?function\\s+' + name + '\\s*\\()');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  const start = m.index + (m[0].startsWith('\n') ? 1 : 0);
  const open = src.indexOf('{', src.indexOf(')', start));
  return src.slice(start, matchBlock(src, open));
}

// Build a context holding the named real functions plus the given globals.
export function buildContext(names, globals = {}, src = readTax()) {
  const ctx = vm.createContext({ ...globals });
  for (const n of names) vm.runInContext(extractFunction(src, n), ctx, { filename: 'tax:' + n });
  return ctx;
}
export function run(ctx, code) { return vm.runInContext(code, ctx); }
export const MONTHS = ['April','May','June','July','August','September','October','November','December','January','February','March'];
