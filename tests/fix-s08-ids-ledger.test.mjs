import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { extractFunction, fakeStorage, sandbox, service } from './lib/fix-s08-source.mjs';

const KEY = 'saagar_wsf_settings_v1';

function idEnv(initialSettings = {}, initialCases = []) {
  const store = fakeStorage();
  if (Object.keys(initialSettings).length) store.setItem(KEY, JSON.stringify(initialSettings));
  const names = ['saveSvcSettings', 'svcReloadSettings', 'svcSuffix', 'svcNoteIssuedId', 'svcDeletedIds', 'svcActorLabel', 'svcRecordDeletion', 'genId'];
  const body = names.map(n => {
    assert.ok(new RegExp('function ' + n + '\\(').test(service), 'expected ' + n);
    return extractFunction(n);
  }).join('\n');
  const ctx = sandbox({ localStorage: store, SaagarModuleBridge: { ownerSession: { currentRole: () => 'Owner' } }, SaagarModuleRuntime: {} }, `
    var SVC_SETTINGS_KEY = '${KEY}';
    var SVC_SETTINGS = ${JSON.stringify(initialSettings)};
    var DB = ${JSON.stringify(initialCases)};
    ${body}
  `);
  return { ctx, store, run: c => vm.runInContext(c, ctx) };
}
const suffix = id => parseInt(/(\d+)$/.exec(id)[1], 10);

test('U07-F11: a deleted newest id is never reused', () => {
  const e = idEnv({}, [{ id: 'WS-2026-001' }, { id: 'WS-2026-002', status: 'open' }]);
  assert.equal(suffix(e.ctx.genId()), 3);
  assert.equal(e.run("svcRecordDeletion(DB[1], {pin:false, reason:''})"), true);
  e.run('DB = DB.filter(function(c){ return c.id !== "WS-2026-002"; })');
  assert.equal(suffix(e.ctx.genId()), 3, 'next id is 3, not 2');
});

test('U07-F11: the high-water mark survives a reload', () => {
  const e = idEnv({}, [{ id: 'WS-2026-001' }, { id: 'WS-2026-002', status: 'open' }]);
  e.run("svcRecordDeletion(DB[1], {pin:false, reason:''})");
  const reloaded = idEnv(JSON.parse(e.store.getItem(KEY)), [{ id: 'WS-2026-001' }]);
  assert.equal(suffix(reloaded.ctx.genId()), 3);
});

test('S08-2 / interface C: tombstone fields, newest last, capped at 2000, failed write reported', () => {
  const e = idEnv({}, [{ id: 'WS-2026-002', status: 'closed', delivery: { finalAmt: '500', payMode: 'Cash', collectDate: '2026-11-10' } }]);
  assert.equal(e.run("svcRecordDeletion(DB[0], {pin:true, reason:'duplicate booking'})"), true);
  const t = JSON.parse(e.store.getItem(KEY)).deleted[0];
  assert.equal(t.id, 'WS-2026-002');
  assert.equal(t.ledgerRef, 'wsc_WS-2026-002');
  assert.equal(t.was, 'closed');
  assert.equal(t.ownerPin, true);
  assert.equal(t.reason, 'duplicate booking');
  assert.equal(t.finalAmt, '500');
  assert.equal(t.payMode, 'Cash');
  assert.equal(t.collectDate, '2026-11-10');
  assert.ok(t.at && t.by);
  assert.equal(JSON.parse(e.store.getItem(KEY)).idHigh, 2);

  e.run("DB = [{id:'WS-2026-003', status:'open'}]");
  e.run("svcRecordDeletion(DB[0], {pin:false, reason:''})");
  const list = JSON.parse(e.store.getItem(KEY)).deleted;
  assert.equal(list[list.length - 1].id, 'WS-2026-003');
  assert.equal(list[list.length - 1].was, 'open');
  assert.equal(list[list.length - 1].ownerPin, false);

  const many = Array.from({ length: 2005 }, (_, i) => ({ id: 'X-' + i, at: 'a' }));
  const big = idEnv({ deleted: many }, [{ id: 'WS-2026-010', status: 'open' }]);
  big.run("svcRecordDeletion(DB[0], {pin:false, reason:''})");
  const capped = JSON.parse(big.store.getItem(KEY)).deleted;
  assert.equal(capped.length, 2000);
  assert.equal(capped[1999].id, 'WS-2026-010');

  const fail = idEnv({}, [{ id: 'WS-2026-004', status: 'open' }]);
  fail.store.throwOnSet = true;
  assert.equal(fail.run("svcRecordDeletion(DB[0], {pin:false, reason:''})"), false);
  // audit S08: the kept case must not stay tombstoned in memory (a later settings save would persist it)
  assert.equal(fail.run('svcDeletedIds().has("WS-2026-004")'), false);
});

test('U07-F11: doSave records the issued id before pushing the new case', () => {
  const body = extractFunction('doSave');
  const noteAt = body.indexOf('svcNoteIssuedId(id)');
  const pushAt = body.indexOf('DB.push(');
  assert.ok(noteAt > -1 && pushAt > noteAt, 'svcNoteIssuedId(id) must come before DB.push(');
  assert.ok(body.includes("let id = g('f-ono');"));
  assert.ok(body.includes('if (byId(id))'));
});

// ───────────────── U14-01 / interface D: stub merge ─────────────────
function mergeEnv({ stored, mem, settings = {} }) {
  const store = fakeStorage();
  if (stored !== undefined) store.setItem('saagar_wsf_v2', typeof stored === 'string' ? stored : JSON.stringify(stored));
  const code = `
    var STORE_KEY = 'saagar_wsf_v2';
    var SVC_SETTINGS = ${JSON.stringify(settings)};
    var DB = ${JSON.stringify(mem)};
    ${extractFunction('svcDeletedIds')}
    ${extractFunction('svcMergeForeignCases')}
    ${extractFunction('saveDB')}
  `;
  const ctx = sandbox({ localStorage: store }, code);
  return { ctx, store, db: () => vm.runInContext('DB', ctx), stored: () => JSON.parse(store.getItem('saagar_wsf_v2')) };
}
const stub = { id: 'wsc_q1', source: 'qms', sourceRef: 'q1', _bridgeStub: true };

test('U14-01: saveDB keeps a stub the bridge added to storage and adopts it in memory', () => {
  const e = mergeEnv({ stored: [{ id: 'A', n: 1 }, stub], mem: [{ id: 'A', n: 1 }] });
  vm.runInContext("DB[0].n = 2", e.ctx);
  e.ctx.saveDB();
  const s = e.stored();
  assert.ok(s.some(c => c.id === 'wsc_q1'));
  assert.equal(s.find(c => c.id === 'A').n, 2, 'memory copy wins');
  assert.ok(e.db().some(c => c.id === 'wsc_q1'));
});

test('U14-01: a tombstoned id is not brought back, and held cases are never duplicated or overwritten', () => {
  const e = mergeEnv({ stored: [{ id: 'A', n: 'old' }, stub], mem: [{ id: 'A', n: 'new' }], settings: { deleted: [{ id: 'wsc_q1' }] } });
  e.ctx.saveDB();
  const s = e.stored();
  assert.ok(!s.some(c => c.id === 'wsc_q1'));
  assert.equal(s.filter(c => c.id === 'A').length, 1);
  assert.equal(s[0].n, 'new');
});

test('U14-01: bad storage never throws and DB is still written', () => {
  for (const bad of ['{not json', '{"a":1}', 'null']) {
    const e = mergeEnv({ stored: bad, mem: [{ id: 'A' }] });
    assert.doesNotThrow(() => e.ctx.saveDB());
    assert.deepEqual(e.stored(), [{ id: 'A' }]);
  }
});

test('U14-01: svcD3CommitCases merges first, and a storage listener adds foreign cases only', () => {
  const commit = extractFunction('svcD3CommitCases');
  assert.ok(/\{\s*if \(typeof svcMergeForeignCases === 'function'\) svcMergeForeignCases\(nextDb\);[^\n]*\n\s*const persistence/.test(commit), 'merge is the first statement');
  assert.ok(/addEventListener\('storage'/.test(service));
  assert.ok(/e\.key !== STORE_KEY/.test(service));
});
