// tests/lib/fix-s01-extract.mjs
// S01 helper: read the real shell text and pull a top-level function out of it by brace matching
// (strings, template literals with nested ${}, regex literals and comments are skipped).
// S01_INDEX / S01_POLICY may point at another copy of the files (used to prove a test fails before the fix).
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const INDEX_PATH = process.env.S01_INDEX || `${ROOT}/www/index.html`;
export const POLICY_PATH = process.env.S01_POLICY || `${ROOT}/www/dashboard-policy.js`;
export const shell = fs.readFileSync(INDEX_PATH, 'utf8');

export function loadPolicy() {
  const box = { module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync(POLICY_PATH, 'utf8'), box);
  return box.module.exports;
}

export function fn(name, src = shell) {
  const m = new RegExp(String.raw`(?:async\s+)?function\s+${name}\s*\(`).exec(src);
  assert.ok(m, `function ${name} not found`);
  const open = src.indexOf('{', src.indexOf(')', m.index));
  const stack = [{ t: 'code', d: 0 }];
  let prev = '=';
  let i = open;
  const top = () => stack[stack.length - 1];
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    const cur = top();
    if (cur.t === 'tpl') {
      if (c === '\\') { i++; continue; }
      if (c === '`') { stack.pop(); prev = 'a'; continue; }
      if (c === '$' && n === '{') { stack.push({ t: 'code', d: 0 }); i++; prev = '='; continue; }
      continue;
    }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
    if (c === "'" || c === '"') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
      prev = 'a'; continue;
    }
    if (c === '`') { stack.push({ t: 'tpl' }); continue; }
    if (c === '/' && /[=(:,!&|?;{}[\]+*%<>~^-]/.test(prev)) {
      let inClass = false;
      for (i++; i < src.length; i++) {
        const r = src[i];
        if (r === '\\') { i++; continue; }
        if (r === '[') inClass = true; else if (r === ']') inClass = false;
        else if (r === '/' && !inClass) break;
      }
      prev = 'a'; continue;
    }
    if (c === '{') { cur.d++; prev = '{'; continue; }
    if (c === '}') {
      if (cur.d === 0 && stack.length > 1) { stack.pop(); prev = 'a'; continue; }
      cur.d--;
      if (cur.d === 0 && stack.length === 1) return src.slice(m.index, i + 1);
      prev = '}'; continue;
    }
    if (!/\s/.test(c)) prev = c;
  }
  assert.fail(`unterminated ${name}`);
}

export function between(startNeedle, endNeedle, src = shell) {
  const a = src.indexOf(startNeedle);
  assert.ok(a >= 0, `missing: ${startNeedle}`);
  const b = src.indexOf(endNeedle, a);
  assert.ok(b > a, `missing end: ${endNeedle}`);
  return src.slice(a, b);
}

// Run function sources inside a fresh vm context with the given globals; returns the context.
export function sandbox(globals, ...sources) {
  const ctx = vm.createContext(Object.assign({ console }, globals));
  ctx.window = ctx;
  for (const s of sources) vm.runInContext(s, ctx);
  return ctx;
}
