// Helpers for the S04 (Queue module) fix tests. New file, S04 only.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadModuleBundle } from './module-bundle.mjs';

export const qmsSource = loadModuleBundle().find((m) => m.id === 'qms').html;

// Source of one top-level function: from "function name(" to the next top-level function/const/let/comment line.
export function fn(name) {
  const token = `function ${name}(`;
  const start = qmsSource.indexOf(token);
  assert.notEqual(start, -1, `${name} must exist in the Queue module`);
  assert.equal(start, qmsSource.lastIndexOf(token), `${name} must be unique`);
  const rest = qmsSource.slice(start + token.length);
  const m = /\n(?:function |const |let |\/\*|window\.)/.exec(rest);
  return qmsSource.slice(start, m ? start + token.length + m.index : qmsSource.length);
}
// One top-level "const NAME=..." line.
export function constLine(name) {
  const token = `const ${name}=`;
  const start = qmsSource.indexOf(token);
  assert.notEqual(start, -1, `${name} must exist in the Queue module`);
  const end = qmsSource.indexOf('\n', start);
  return qmsSource.slice(start, end);
}
export function run(ctx, code) {
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx;
}
export const plain = (v) => JSON.parse(JSON.stringify(v));
