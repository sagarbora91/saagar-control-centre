// Helper for the S08 (Service) fix tests: reads the real Service module text and cuts real functions out of it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const servicePath = path.resolve(here, '../../www/modules/service/index.html');
export const cssPath = path.resolve(here, '../../www/modules/service/service-ui.css');
export const service = fs.readFileSync(servicePath, 'utf8');
export const serviceCss = fs.readFileSync(cssPath, 'utf8');

// Cut a top-level function (sync or async) out of the source. Top-level functions in the Service
// module end with a line that is exactly "}" or are written on one line, so the end is found by
// trying each candidate end and keeping the first slice that compiles.
export function extractFunction(name, source = service) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const match = re.exec(source);
  assert.ok(match, 'expected function ' + name);
  const start = match.index;
  const lineEnd = source.indexOf('\n', start);
  const firstLine = source.slice(start, lineEnd < 0 ? source.length : lineEnd);
  try { new vm.Script(firstLine); return firstLine; } catch (e) { /* multi-line */ }
  let from = lineEnd;
  for (let guard = 0; guard < 4000; guard += 1) {
    const next = source.indexOf('\n}', from);
    if (next < 0) break;
    const candidate = source.slice(start, next + 2);
    try { new vm.Script(candidate); return candidate; } catch (e) { from = next + 1; }
  }
  assert.fail('could not cut ' + name);
}

export function sandbox(globals, code) {
  const ctx = vm.createContext(Object.assign({ console }, globals));
  vm.runInContext(code, ctx);
  return ctx;
}

export function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    m, throwOnSet: false,
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { if (this.throwOnSet) throw new Error('quota'); m.set(k, String(v)); },
    removeItem(k) { m.delete(k); }
  };
}
