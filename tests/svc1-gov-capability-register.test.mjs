// Service wave 1, governance T4: tests/fixtures/service-wave-1/capability-register.json against the sources, both ways.
// The register is the list the owner reconfirms. A control, key, code or report that is in the source but not in the register
// (or the other way round) is an undeclared capability. Red here means: fix the source or update the register, never ignore.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SEVEN, exists, readText, loadJson, loadApi, parseScript, walk, extractActionIds, samplesForPattern, ACTION_ID } from './lib/svc1-gov-common.mjs';

const reg = loadJson('capability-register.json');
const byKey = Object.fromEntries(SEVEN.map((f) => [f.key, f]));
const TIERS = new Set(['staff', 'manager', 'owner']);
const OWNER_FILE = { ui: 'www/service-stores-ui.js', mui: 'www/service-stores-masters-ui.js' };

test('T4.1 register shape: seven files, unique ids, allowed values, every row pending owner reconfirmation', () => {
  assert.equal(reg.schemaVersion, 1);
  assert.equal(reg.waveId, 'service-wave-1-phase-1');
  assert.deepEqual(reg.files, SEVEN.map((f) => f.file));
  const ids = reg.actions.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'action ids are unique');
  const streams = new Set(reg.keys.filter((k) => k.stream).map((k) => k.stream));
  for (const a of reg.actions) {
    assert.match(a.id, ACTION_ID, a.id);
    assert.equal(/\d{10}/.test(a.id) || /\d{4}-\d{2}-\d{2}/.test(a.id), false, a.id + ' has a long digit run or a date');
    assert.equal(a.attribute, 'data-svcs-action', a.id);
    assert.equal(a.status, 'pending owner reconfirmation', a.id);
    assert.equal(a.phase, 1, a.id);
    assert.ok(TIERS.has(a.tier), a.id + ' tier');
    assert.ok(a.ownerPin === true || a.ownerPin === false || a.ownerPin === 'conditional', a.id + ' ownerPin');
    assert.ok(a.owner === 'ui' || a.owner === 'mui', a.id + ' owner');
    assert.equal(a.id.startsWith(a.owner === 'ui' ? 'svs-' : 'svcm-'), true, a.id + ' prefix matches owner');
    for (const s of a.persists) assert.ok(streams.has(s), a.id + ' persists unknown stream ' + s);
    if (a.ownerPin === true) assert.equal(a.tier, 'owner', a.id + ': an always-PIN action is Owner tier');
    if (a.kind === 'view' || a.kind === 'navigation' || a.kind === 'dialog') assert.deepEqual(a.persists, [], a.id + ' writes nothing');
  }
  const codes = new Set(reg.failureCodes.map((c) => c.code));
  for (const a of reg.actions) for (const c of a.failureCodes) assert.ok(codes.has(c), a.id + ' names unregistered code ' + c);
  assert.equal(new Set(reg.failureCodes.map((c) => c.layer + ':' + c.code)).size, reg.failureCodes.length, 'no duplicate (layer, code) row');
});

for (const owner of ['ui', 'mui']) {
test(`T4.2 [${owner}] every action id in the screen sources is in the register and every register id is in a source, per file`, () => {
  {
    const rel = OWNER_FILE[owner];
    assert.ok(exists(rel), 'waiting on writers: ' + rel);
    const found = extractActionIds(readText(rel));
    assert.deepEqual(found.bad, [], rel + ' has data-svcs-action values that are not kebab-case ids');
    assert.deepEqual(found.dynamic, [], rel + ' builds an action id at run time outside an action helper');
    const want = reg.actions.filter((a) => a.owner === owner).map((a) => a.id).sort();
    const have = [...found.all].filter((id) => id.startsWith(owner === 'ui' ? 'svs-' : 'svcm-')).sort();
    assert.deepEqual(have.filter((x) => !want.includes(x)), [], `${rel}: in source, not in register`);
    assert.deepEqual(want.filter((x) => !have.includes(x)), [], `${rel}: in register, not in source`);
    const foreign = [...found.all].filter((id) => !id.startsWith(owner === 'ui' ? 'svs-' : 'svcm-'));
    assert.deepEqual(foreign, [], `${rel} holds ids of the other screen file`);
  }
});
}

for (const owner of ['ui', 'mui']) {
test(`T4.3 [${owner}] every control id rendered as data-svcs-action has a dispatch branch (no dead button)`, () => {
  {
    const rel = OWNER_FILE[owner];
    assert.ok(exists(rel), 'waiting on writers: ' + rel);
    const found = extractActionIds(readText(rel));
    const dead = [...found.markup].filter((id) => !found.dispatch.has(id));
    assert.deepEqual(dead, [], `${rel}: rendered but never dispatched`);
  }
});
}

for (const owner of ['ui', 'mui']) {
test(`T4.4 [${owner}] every register handler (when named) is a function in its file`, () => {
  {
    const rel = OWNER_FILE[owner];
    assert.ok(exists(rel), 'waiting on writers: ' + rel);
    const names = new Set();
    walk(parseScript(readText(rel)), (n) => {
      if (n.type === 'FunctionDeclaration' && n.id) names.add(n.id.name);
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && /Function/.test(n.init.type)) names.add(n.id.name);
      if (n.type === 'ObjectProperty' && n.value && /Function/.test(n.value.type) && n.key.name) names.add(n.key.name);
      if (n.type === 'ObjectMethod' && n.key.name) names.add(n.key.name);
      if (n.type === 'AssignmentExpression' && n.right && /Function/.test(n.right.type) && n.left.type === 'MemberExpression' && n.left.property.name) names.add(n.left.property.name);
    });
    for (const a of reg.actions.filter((x) => x.owner === owner && x.handler)) assert.ok(names.has(a.handler), a.id + ': handler ' + a.handler + ' not found');
  }
});
}

test('T4.5 storage keys: every register pattern is produced by the store and every store stream is in the register', () => {
  const store = loadApi(byKey.store);
  assert.ok(store, 'store loads');
  const streamsInStore = Object.keys(store.STREAMS).sort();
  const streamsInReg = reg.keys.filter((k) => k.stream).map((k) => k.stream).sort();
  assert.deepEqual(streamsInReg, streamsInStore, 'register streams equal STREAMS');
  for (const k of reg.keys) {
    for (const key of samplesForPattern(k.pattern)) {
      if (k.name === 'watermark') { assert.equal(key, store.WATERMARK_KEY); assert.ok(store.KEY_RE.watermark.test(key), key); continue; }
      assert.equal(key.indexOf(store.SVCS_PREFIX), 0, key + ' must start with the prefix');
      const hit = Object.keys(store.KEY_RE).filter((r) => store.KEY_RE[r].test(key));
      assert.ok(hit.length >= 1, key + ' is not matched by KEY_RE');
    }
    assert.equal(k.shape, k.name === 'watermark' ? 'object' : 'array');
    assert.equal(k.inBackup, k.name !== 'watermark', k.name);
    assert.equal(k.deviceLocal, k.name === 'watermark', k.name);
    assert.equal(k.writer, 'SaagarServiceStoresStore.adapterFromWindow');
  }
  assert.equal(reg.keys.length, streamsInStore.length + 2, 'seven streams plus head plus watermark');
  for (const stream of streamsInStore) {
    const row = reg.keys.find((k) => k.stream === stream);
    const at = '2026-11-13T05:00:00.000Z';
    const real = store.shardKey(stream, at, 1);
    const real2 = store.shardKey(stream, at, 2);
    const sample = samplesForPattern(row.pattern);
    assert.ok(sample.includes(real), `${stream}: shardKey ${real} is a register sample`);
    assert.ok(sample.includes(real2), `${stream}: shardKey part 2 ${real2} is a register sample`);
  }
});

test('T4.6 failure codes: each layer exports exactly the codes the register lists for it', () => {
  const missing = [];
  for (const layer of ['store', 'fifo', 'masters', 'docs', 'core']) {
    const api = loadApi(byKey[layer]);
    if (!api) { missing.push(byKey[layer].file); continue; }
    const have = Object.keys(api.CODES).sort();
    const want = reg.failureCodes.filter((c) => c.layer === layer).map((c) => c.code).sort();
    assert.deepEqual(have.filter((x) => !want.includes(x)), [], `${layer}: code in source, not in register`);
    assert.deepEqual(want.filter((x) => !have.includes(x)), [], `${layer}: code in register, not in source`);
    for (const c of have) assert.ok(api.MESSAGES && typeof api.MESSAGES[c] === 'string' && api.MESSAGES[c].length > 0, `${layer}.${c} has an English message`);
  }
  assert.deepEqual(missing, [], 'waiting on writers');
});

test('T4.7 SVS_ codes in the two screen files equal the register ui codes', () => {
  const found = new Set();
  for (const rel of Object.values(OWNER_FILE)) {
    assert.ok(exists(rel), 'waiting on writers: ' + rel);
    walk(parseScript(readText(rel)), (n) => {
      if (n.type === 'StringLiteral' && /^SVS_[A-Z0-9_]+$/.test(n.value)) found.add(n.value);
      if (n.type === 'ObjectProperty' && !n.computed && n.key.type === 'Identifier' && /^SVS_[A-Z0-9_]+$/.test(n.key.name)) found.add(n.key.name);
    });
  }
  const want = reg.failureCodes.filter((c) => c.layer === 'ui').map((c) => c.code);
  assert.deepEqual([...found].filter((x) => !want.includes(x)).sort(), [], 'SVS code in source, not in register');
  assert.deepEqual(want.filter((x) => !found.has(x)).sort(), [], 'SVS code in register, not in source');
});

test('T4.8 reports: the six types are in REPORT_MODULE of both files with the agreed module, and the core lists the same six', () => {
  const blockOf = (rel) => {
    const t = readText(rel);
    const i = t.indexOf('REPORT_MODULE = {');
    assert.ok(i >= 0, rel + ' has REPORT_MODULE');
    const j = t.indexOf('};', i);
    const out = {};
    for (const m of t.slice(i, j).matchAll(/([A-Za-z0-9_]+)\s*:\s*'([^']*)'/g)) out[m[1]] = m[2];
    return out;
  };
  const a = blockOf('www/saagar-report.js');
  const b = blockOf('www/shared/shell-search.js');
  for (const r of reg.reports) {
    assert.equal(a[r.type], r.module, `saagar-report.js ${r.type}`);
    // shell-search.js writes the owner-level summary ('*' in saagar-report.js) as '' exactly as it does for ownerBrief
    assert.equal(b[r.type], r.module === '*' ? '' : r.module, `shell-search.js ${r.type}`);
  }
  assert.deepEqual(Object.keys(a).filter((k) => /^svc[A-Z]/.test(k)).sort(), reg.reports.map((r) => r.type).sort());
  assert.deepEqual(Object.keys(b).filter((k) => /^svc[A-Z]/.test(k)).sort(), reg.reports.map((r) => r.type).sort());
  assert.equal(reg.reports.filter((r) => r.module === '*').length, 1);
  assert.equal(reg.reports.find((r) => r.type === 'svcAdjustmentRegister').module, '*');
  const core = loadApi(byKey.core);
  assert.ok(core, 'waiting on writers: core');
  assert.deepEqual([...core.REPORT_TYPES].sort(), reg.reports.map((r) => r.type).sort());
});

test('T4.9 report builders exist in saagar-report.js for each type, read only opts.svcData and are not in the Reports hub', () => {
  const t = readText('www/saagar-report.js');
  for (const r of reg.reports) {
    assert.ok(t.indexOf(r.type) !== -1, r.type + ' appears in saagar-report.js');
    assert.ok(new RegExp('(^|[^A-Za-z0-9_])' + r.type + '\\s*[:=(]').test(t), r.type + ' has a definition');
  }
  assert.ok(t.indexOf('svcData') !== -1, 'builders read opts.svcData');
  const hubStart = t.indexOf('var HUB');
  if (hubStart >= 0) for (const r of reg.reports) assert.equal(t.slice(hubStart, hubStart + 4000).includes(r.type), false, r.type + ' must not be in the Reports hub');
});

test('T4.10 the register is complete for the approval record: every write action names its streams, every PIN action is Owner tier', () => {
  const writes = reg.actions.filter((a) => a.kind === 'write');
  assert.ok(writes.length >= 30);
  const pins = reg.actions.filter((a) => a.ownerPin === true);
  assert.ok(pins.length >= 6, 'at least the confirm steps of reverse receipt, scrap sign-off, opening post, override, settings, restore acknowledge');
  const streamWrites = new Set(writes.flatMap((a) => a.persists));
  for (const s of ['ledger', 'docs', 'defective', 'config', 'audit', 'parts', 'labour']) assert.ok(streamWrites.has(s), 'some action writes ' + s);
  assert.equal(reg.status, 'pending owner reconfirmation');
});
