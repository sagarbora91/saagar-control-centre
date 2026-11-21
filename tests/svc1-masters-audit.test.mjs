// Audit regression tests for www/service-stores-masters.js (invented test data only).
// Real store file over an in-memory adapter. SVC1_MASTERS_FILE may point at another copy of the masters file
// (used by the auditor to prove these tests fail on the code before the audit fixes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { MANAGER, OWNER, part, NO_STOCK } from './lib/svc1-masters-env.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const storePath = path.join(here, '..', 'www', 'service-stores-store.js');
const M = require(process.env.SVC1_MASTERS_FILE || path.join(here, '..', 'www', 'service-stores-masters.js'));

function world() {
  const S = require(storePath);
  let ms = Date.parse('2026-11-13T09:30:00.000Z');
  const map = new Map();
  const adapter = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    keys: () => Array.from(map.keys()),
    authoritative: () => true
  };
  const mk = () => {
    const c = S.createStore(adapter, { now: () => new Date(ms).toISOString() });
    const s = c.store || c;
    const o = s.open({ replay: () => [] });
    assert.equal(o.ok, true);
    return s;
  };
  const ctx = (session, extra = {}) => ({ session, now: () => new Date(ms), ...extra });
  return { map, mk, ctx, pin: () => ({ ok: true, at: ms }) };
}

const real = existsSync(storePath);

test('a reopened store is never served an old fold: rows written by another tab appear after reopen', { skip: !real }, () => {
  const w = world();
  const a = w.mk();
  const b = w.mk();
  assert.equal(M.createRow(a, w.ctx(MANAGER), 'part', part('AU1')).ok, true);
  assert.equal(M.loadMasters(a).parts.length, 1);
  b.open({ replay: () => [] });
  assert.equal(M.createRow(b, w.ctx(MANAGER), 'part', part('AU2')).ok, true);
  M.loadMasters(a); // a still holds its old memory here; this call must not pin that view
  a.open({ replay: () => [] });
  assert.deepEqual(M.loadMasters(a).parts.map((r) => r.code), ['AU1', 'AU2']);
});

test('a store that became blocked after a load refuses every master read (no cached rows)', { skip: !real }, () => {
  const w = world();
  const s = w.mk();
  assert.equal(M.createRow(s, w.ctx(MANAGER), 'part', part('AB1')).ok, true);
  assert.equal(M.createRow(s, w.ctx(MANAGER), 'part', part('AB2')).ok, true);
  assert.equal(M.loadMasters(s).ok, true);
  const key = Array.from(w.map.keys()).find((k) => /^saagar_svcs_parts_v1/.test(k));
  const arr = JSON.parse(w.map.get(key));
  arr[0].b.row.name = 'Tampered name';
  w.map.set(key, JSON.stringify(arr));
  assert.equal(s.open({ replay: () => [] }).blocked, true);
  const l = M.loadMasters(s);
  assert.equal(l.ok, false);
  assert.equal(l.code, 'SVCS_BLOCKED');
  assert.equal(M.getRow(s, 'part', 'AB1').ok, false);
});

test('a client ref used by one action never makes another action report success without writing', { skip: !real }, () => {
  const w = world();
  const s = w.mk();
  const ref = 'svs-audit-ref1';
  assert.equal(M.createRow(s, w.ctx(MANAGER, { clientRef: ref }), 'part', part('AR1')).ok, true);
  const rm = M.removeUnused(s, w.ctx(OWNER, { clientRef: ref, stepUp: w.pin() }), 'part', 'AR1', 'remove the row', NO_STOCK);
  assert.equal(rm.ok, false);
  assert.equal(rm.replayed, undefined);
  const de = M.setActive(s, w.ctx(MANAGER, { clientRef: ref }), 'part', 'AR1', false, 'stop using it', NO_STOCK);
  assert.equal(de.ok, false);
  const ed = M.editRow(s, w.ctx(MANAGER, { clientRef: ref }), 'part', 'AR1', { name: 'Other name' }, 1, '');
  assert.equal(ed.ok, false);
  const row = M.getRow(s, 'part', 'AR1').row;
  assert.equal(row.active, true);
  assert.equal(row.rev, 1);
  // the same action with the same ref is still a safe replay
  const again = M.createRow(s, w.ctx(MANAGER, { clientRef: ref }), 'part', part('AR1'));
  assert.equal(again.ok, true);
  assert.equal(again.replayed, true);
  assert.equal(s.read('parts').records.length, 1);
});

test('tier owner without isOwner===true, or isOwner on a manager tier, can neither remove nor edit', { skip: !real }, () => {
  const w = world();
  const s = w.mk();
  assert.equal(M.createRow(s, w.ctx(MANAGER), 'part', part('AO1')).ok, true);
  const fakeOwner = { ...OWNER, isOwner: false };
  const liftedMgr = { ...MANAGER, isOwner: true };
  assert.equal(M.removeUnused(s, w.ctx(fakeOwner, { stepUp: w.pin() }), 'part', 'AO1', 'remove the row', NO_STOCK).code, 'ROLE_DENIED');
  assert.equal(M.removeUnused(s, w.ctx(liftedMgr, { stepUp: w.pin() }), 'part', 'AO1', 'remove the row', NO_STOCK).code, 'ROLE_DENIED');
  assert.equal(M.removeUnused(s, w.ctx({ ...OWNER, tier: 'Owner' }, { stepUp: w.pin() }), 'part', 'AO1', 'remove the row', NO_STOCK).code, 'SESSION_REQUIRED');
  assert.equal(M.editRow(s, w.ctx(fakeOwner), 'part', 'AO1', { name: 'X name' }, 1, '').code, 'ROLE_DENIED');
  assert.equal(M.rights(fakeOwner).remove, false);
  assert.equal(M.getRow(s, 'part', 'AO1').ok, true);
  assert.equal(s.read('parts').records.length, 1);
});

test('hostile values never throw: objects without a prototype or with a throwing toString are refused', { skip: !real }, () => {
  const w = world();
  const s = w.mk();
  const bad = [Object.create(null), { toString() { throw new Error('boom'); } }, ['x'], true];
  for (const v of bad) {
    for (const f of ['code', 'name', 'group', 'hsn', 'bin', 'unit']) {
      let r;
      assert.doesNotThrow(() => { r = M.createRow(s, w.ctx(MANAGER), 'part', part('HX1', { [f]: v })); }, f);
      assert.equal(r.ok, false, f + ' ' + typeof v);
    }
    assert.doesNotThrow(() => M.getRow(s, 'part', v));
    assert.doesNotThrow(() => M.validateRow('labour', { code: 'L1', name: 'n', group: 'g', sac: v }, {}));
  }
  assert.equal(s.read('parts').records.length, 0);
  const sess = { ...MANAGER, role: Object.create(null), actorName: { toString() { throw new Error('boom'); } } };
  assert.doesNotThrow(() => M.createRow(s, w.ctx(sess), 'part', part('HX2')));
});
