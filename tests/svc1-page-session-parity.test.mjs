// svc1 page group (audit): the glue's bridge fallback in svsSession must give the same role answer as the
// real SaagarModuleRuntime.session() for every agreed S15 session row, every broken row and odd role types.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { glueEnv } from './lib/svc1-page-source.mjs';
import { SESSIONS, BROKEN } from './lib/fix-s15-role-table.mjs';

const RUNTIME = fs.readFileSync(new URL('../www/shared/module-runtime.js', import.meta.url), 'utf8');

function readerFor(read) {
  if (read === undefined) return undefined;
  return { read: () => { if (read === 'THROW') throw new Error('x'); return read; } };
}
function runtimeSession(read) {
  const shell = {};
  const api = readerFor(read);
  if (api) shell.SaagarOwnerSession = api;
  const win = { location: { origin: 'https://app.local' }, console };
  win.parent = shell;
  const ctx = vm.createContext(win);
  win.window = win;
  vm.runInContext(RUNTIME, ctx);
  return win.SaagarModuleRuntime.session();
}
function glueSession(read) {
  const api = readerFor(read);
  const bridge = api ? { ownerSession: api } : {};
  return glueEnv({ SaagarModuleBridge: bridge }).api.svsSession();
}
const plain = (s) => {
  const o = JSON.parse(JSON.stringify(s));
  delete o.actorName; // the fallback has no name source; the runtime may fill one
  return o;
};

const ODD = [
  { name: 'role is a number', read: { isOwner: false, isManager: false, role: 5 } },
  { name: 'role is an object with toString', read: { isOwner: false, isManager: false, role: { toString() { return 'Store Manager'; } } } },
  { name: 'role missing', read: { isOwner: false } },
  { name: 'manager flag only', read: { isManager: true } },
];

test('svsSession bridge fallback matches the real runtime for every S15, broken and odd row', () => {
  for (const row of [...SESSIONS, ...BROKEN, ...ODD]) {
    assert.deepEqual(plain(glueSession(row.read)), plain(runtimeSession(row.read)), row.name);
  }
});

test('svsSession never returns null and never grants Owner on a non-true flag', () => {
  for (const row of [...BROKEN, ...ODD]) {
    const s = glueSession(row.read);
    assert.ok(s && typeof s === 'object', row.name);
    assert.equal(s.isOwner, false, row.name);
  }
});
