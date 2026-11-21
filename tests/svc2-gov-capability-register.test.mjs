// Service wave 2, governance T4: tests/fixtures/service-wave-2/capability-register.json against the sources, both ways.
// The register is made by a tool from the sources (service-wave-2/work/W-GOV/build-register.mjs), never typed. The owner reconfirms it.
// A control, key, code or report that is in the source but not in the register (or the other way round) is an undeclared capability.
// Red here means: run the tool again if the source is right, fix the source if it is not. Never ignore.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BILLING, BILLING_FILES, PHASE1, REPORT_TYPES_W2, exists, readText, loadJson, phase1Json, loadApi, parseScript, walk, extractActionIds, samplesForPattern,
  ACTION_ID, branchesOf, functionBodies, reachesCall, reachesWrite, FACADE_WRITES, WRITE_STREAMS
} from './lib/svc2-gov-common.mjs';

const reg = loadJson('capability-register.json');
const reg1 = phase1Json('capability-register.json');
const byKey = Object.fromEntries(BILLING.map((f) => [f.key, f]));
const p1ByKey = Object.fromEntries(PHASE1.map((f) => [f.key, f]));
const TIERS = new Set(['staff', 'manager', 'owner']);
const KINDS = new Set(['write', 'view', 'navigation']);
const OWNER_FILE = { ui: 'www/service-billing-ui.js', area: 'www/service-billing-area-ui.js' };
const LAYER_FILE = { calc: 'calc', bdocs: 'docs', money: 'money', migrate: 'migrate', bcore: 'core' };
const PHASE2_STREAMS = ['invoices', 'receipts'];

test('T4.1 register shape: seven billing files, unique svb- ids, allowed values, every row pending owner reconfirmation', () => {
  assert.equal(reg.schemaVersion, 1);
  assert.equal(reg.waveId, 'service-wave-2-phase-2');
  assert.equal(reg.status, 'pending owner reconfirmation');
  assert.deepEqual(reg.files, BILLING_FILES);
  const ids = reg.actions.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'action ids are unique');
  const streams = new Set(reg.keys.filter((k) => k.stream).map((k) => k.stream));
  // Stage E round 2 (A): "Put back in stock" writes a Phase 1 return (RET) into the Phase 1 ledger, the only Phase 1 stream a billing control may name
  streams.add('ledger');
  for (const a of reg.actions) {
    assert.match(a.id, ACTION_ID, a.id);
    assert.equal(/\d{10}/.test(a.id) || /\d{4}-\d{2}-\d{2}/.test(a.id), false, a.id + ' has a long digit run or a date');
    assert.equal(a.attribute, 'data-svcs-action', a.id);
    assert.equal(a.status, 'pending owner reconfirmation', a.id);
    assert.equal(a.phase, 2, a.id);
    assert.ok(TIERS.has(a.tier), a.id + ' tier');
    assert.equal(typeof a.ownerPin, 'boolean', a.id + ' ownerPin is measured: true or false');
    assert.ok(a.owner === 'ui' || a.owner === 'area', a.id + ' owner');
    assert.ok(KINDS.has(a.kind), a.id + ' kind');
    for (const s of a.persists) assert.ok(streams.has(s), a.id + ' persists unknown stream ' + s);
    if (a.ownerPin === true) assert.equal(a.tier, 'owner', a.id + ': an Owner PIN action is Owner tier');
    if (a.kind !== 'write') assert.deepEqual(a.persists, [], a.id + ' writes nothing');
    if (a.kind === 'write') assert.ok(a.persists.length >= 1, a.id + ' names its streams');
  }
  const codes = new Set(reg.failureCodes.map((c) => c.code));
  for (const a of reg.actions) for (const c of a.failureCodes) assert.ok(codes.has(c), a.id + ' names unregistered code ' + c);
  assert.equal(new Set(reg.failureCodes.map((c) => c.layer + ':' + c.code)).size, reg.failureCodes.length, 'no duplicate (layer, code) row');
  assert.ok(reg.actions.length >= 1, 'no run-time control at all is registered (waiting on W-UI and W-AREA, then run the register tool)');
});

for (const owner of ['ui', 'area']) {
  test(`T4.2 [${owner}] every svb- action id in the screen source is in the register and every register id is in the source`, () => {
    const rel = OWNER_FILE[owner];
    assert.ok(exists(rel), 'waiting on writers: ' + rel);
    const found = extractActionIds(readText(rel));
    assert.deepEqual(found.bad, [], rel + ' has data-svcs-action values that are not svb- kebab-case ids');
    assert.deepEqual(found.dynamic, [], rel + ' builds an action id at run time outside an action helper');
    const want = reg.actions.filter((a) => a.owner === owner).map((a) => a.id).sort();
    const have = [...found.all].sort();
    assert.deepEqual(have.filter((x) => !want.includes(x)), [], `${rel}: in source, not in register`);
    assert.deepEqual(want.filter((x) => !have.includes(x)), [], `${rel}: in register, not in source`);
    // an id of the Phase 1 register can never appear here
    const p1 = new Set(reg1.actions.map((a) => a.id));
    assert.deepEqual(have.filter((x) => p1.has(x)), [], 'no id collides with a Phase 1 id');
  });

  test(`T4.3 [${owner}] every control id rendered as data-svcs-action has a dispatch branch (no dead button)`, () => {
    const rel = OWNER_FILE[owner];
    assert.ok(exists(rel), 'waiting on writers: ' + rel);
    const found = extractActionIds(readText(rel));
    const dead = [...found.markup].filter((id) => !found.dispatch.has(id));
    assert.deepEqual(dead, [], `${rel}: rendered but never dispatched`);
  });

  test(`T4.4 [${owner}] ownerPin, kind and streams in the register equal what the dispatch branches reach (measured from the source)`, () => {
    const rel = OWNER_FILE[owner];
    assert.ok(exists(rel), 'waiting on writers: ' + rel);
    const ast = parseScript(readText(rel));
    const fnBodies = functionBodies(ast);
    const wrong = [];
    for (const a of reg.actions.filter((x) => x.owner === owner)) {
      const bs = branchesOf(ast, a.id);
      if (bs.length === 0) { wrong.push(a.id + ': no dispatch branch'); continue; }
      const pin = bs.some((b) => reachesCall(b, fnBodies, (nm) => nm === 'reauth'));
      const writes = FACADE_WRITES.filter((w) => bs.some((b) => reachesWrite(b, fnBodies, w)));
      if (pin !== a.ownerPin) wrong.push(`${a.id}: ownerPin register ${a.ownerPin}, source ${pin}`);
      if ((writes.length > 0) !== (a.kind === 'write')) wrong.push(`${a.id}: kind register ${a.kind}, source reaches ${writes.join(',') || 'no write'}`);
      assert.deepEqual([...(a.writes || [])].sort(), [...writes].sort(), a.id + ' writes');
      const streams = [...new Set(writes.flatMap((w) => WRITE_STREAMS[w]))].sort();
      assert.deepEqual([...a.persists].sort(), streams, a.id + ' persists');
    }
    assert.deepEqual(wrong, []);
  });
}

test('T4.5 storage keys: the two Phase 2 streams are produced by the store, matched by KEY_RE, and the Phase 1 register still lists its seven', () => {
  const store = loadApi(p1ByKey.store);
  assert.ok(store, 'store loads');
  const phase1Streams = reg1.keys.filter((k) => k.stream).map((k) => k.stream).sort();
  const all = Object.keys(store.STREAMS).sort();
  assert.deepEqual(all, phase1Streams.concat(PHASE2_STREAMS).sort(), 'STREAMS = the seven Phase 1 streams plus invoices and receipts (nine)');
  const streamsInReg = reg.keys.filter((k) => k.stream).map((k) => k.stream).sort();
  assert.deepEqual(streamsInReg, PHASE2_STREAMS, 'the Phase 2 register holds exactly the two new streams');
  assert.equal(reg.keys.length, 2, 'two rows: no head or watermark row here (they are Phase 1 rows)');
  for (const k of reg.keys) {
    for (const key of samplesForPattern(k.pattern)) {
      assert.equal(key.indexOf(store.SVCS_PREFIX), 0, key + ' must start with the prefix');
      const hit = Object.keys(store.KEY_RE).filter((r) => store.KEY_RE[r].test(key));
      assert.ok(hit.length >= 1, key + ' is not matched by KEY_RE');
    }
    assert.equal(k.shape, 'array');
    assert.equal(k.inBackup, true, k.name);
    assert.equal(k.deviceLocal, false, k.name);
    assert.equal(k.appendOnly, true, k.name);
    assert.equal(k.writer, 'SaagarServiceStoresStore.adapterFromWindow');
  }
  for (const stream of PHASE2_STREAMS) {
    const row = reg.keys.find((k) => k.stream === stream);
    const at = '2026-11-18T05:00:00.000Z';
    const sample = samplesForPattern(row.pattern);
    assert.ok(sample.includes(store.shardKey(stream, at, 1)), `${stream}: shardKey ${store.shardKey(stream, at, 1)} is a register sample`);
    assert.ok(sample.includes(store.shardKey(stream, at, 2)), `${stream}: part 2 key is a register sample`);
    assert.equal(store.STREAMS[stream].code, stream === 'invoices' ? 'INV' : 'RCT');
  }
  assert.deepEqual(Object.keys(store.SERIES).sort(), ['ADJ', 'CSL', 'GRN', 'ISS', 'OLD', 'OPN', 'RET', 'SAR', 'SCN', 'SCR', 'SRC', 'SRF', 'SV']);
  assert.deepEqual(Object.keys(store).length, 20, 'the store export key list stays at 20 names');
});

test('T4.6 failure codes: each billing layer exports exactly the codes the register lists for it, each with an English message', () => {
  const missing = [];
  for (const [layer, key] of Object.entries(LAYER_FILE)) {
    const api = loadApi(byKey[key]);
    if (!api) { missing.push(byKey[key].file); continue; }
    const have = Object.keys(api.CODES).sort();
    const want = reg.failureCodes.filter((c) => c.layer === layer).map((c) => c.code).sort();
    assert.deepEqual(have.filter((x) => !want.includes(x)), [], `${layer}: code in source, not in register`);
    assert.deepEqual(want.filter((x) => !have.includes(x)), [], `${layer}: code in register, not in source`);
    for (const c of have) assert.ok(api.MESSAGES && typeof api.MESSAGES[c] === 'string' && api.MESSAGES[c].length > 0, `${layer}.${c} has an English message`);
  }
  assert.deepEqual(missing, [], 'waiting on writers');
});

test('T4.7 SVB_ codes in the two screen files equal the register ui codes', () => {
  const found = new Set();
  for (const rel of Object.values(OWNER_FILE)) {
    assert.ok(exists(rel), 'waiting on writers: ' + rel);
    walk(parseScript(readText(rel)), (n) => {
      if (n.type === 'StringLiteral' && /^SVB_[A-Z0-9_]+$/.test(n.value)) found.add(n.value);
      if (n.type === 'ObjectProperty' && !n.computed && n.key.type === 'Identifier' && /^SVB_[A-Z0-9_]+$/.test(n.key.name)) found.add(n.key.name);
    });
  }
  const want = reg.failureCodes.filter((c) => c.layer === 'ui').map((c) => c.code);
  assert.deepEqual([...found].filter((x) => !want.includes(x)).sort(), [], 'SVB code in source, not in register');
  assert.deepEqual(want.filter((x) => !found.has(x)).sort(), [], 'SVB code in register, not in source');
});

test('T4.8 reports: the ten plan-2.15 types are in REPORT_MODULE of both files with the agreed module, none looks like svcXxx, the six Phase 1 types are unchanged', () => {
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
  assert.deepEqual(reg.reports.map((r) => r.type).sort(), REPORT_TYPES_W2.map((r) => r.type).sort(), 'the register holds exactly the ten types of plan 2.15');
  for (const r of REPORT_TYPES_W2) {
    assert.equal(a[r.type], r.module, `saagar-report.js ${r.type}`);
    assert.equal(b[r.type], r.module === '*' ? '' : r.module, `shell-search.js ${r.type}`);
    const row = reg.reports.find((x) => x.type === r.type);
    assert.ok(row && row.module === r.module, 'register row ' + r.type);
  }
  const p1 = reg1.reports.map((r) => r.type).sort();
  assert.deepEqual(Object.keys(a).filter((k) => /^svc[A-Z]/.test(k)).sort(), p1, 'saagar-report.js: svcXxx names stay the six Phase 1 types');
  assert.deepEqual(Object.keys(b).filter((k) => /^svc[A-Z]/.test(k)).sort(), p1, 'shell-search.js: same');
  assert.equal(reg.reports.filter((r) => r.module === '*').length, 3);
  const core = loadApi(byKey.core);
  assert.ok(core, 'waiting on writers: billing core');
  const pt = core.PRINT_TYPES;
  const names = Array.isArray(pt) ? pt : (pt && typeof pt === 'object' ? (Object.values(pt).every((v) => typeof v === 'string') ? Object.values(pt) : Object.keys(pt)) : []);
  assert.deepEqual([...names].sort(), REPORT_TYPES_W2.map((r) => r.type).sort(), 'PRINT_TYPES of the facade are the ten types');
});

test('T4.9 report builders exist in saagar-report.js for each type, read svcData only, and none is in the Reports hub', async () => {
  const t = readText('www/saagar-report.js');
  for (const r of reg.reports) {
    assert.ok(t.indexOf(r.type) !== -1, r.type + ' appears in saagar-report.js');
    assert.ok(new RegExp('(^|[^A-Za-z0-9_])' + r.type + '\\s*[:=(]').test(t), r.type + ' has a definition');
  }
  assert.ok(t.indexOf('svcData') !== -1, 'builders read opts.svcData');
  const { HUB_TYPES } = await import('./lib/fix-s02-load.mjs');
  for (const r of reg.reports) assert.equal(HUB_TYPES.includes(r.type), false, r.type + ' must not be in the Reports hub');
});

test('T4.10 completeness: every Owner PIN point of plan 2.11 is reached from a register control that asks for the PIN, and every PIN control is Owner tier', () => {
  const pins = reg.actions.filter((a) => a.ownerPin === true);
  assert.ok(pins.length >= 1, 'no PIN control registered (waiting on W-UI and W-AREA)');
  for (const p of pins) assert.equal(p.tier, 'owner', p.id);
  const reaches = (method) => reg.actions.some((a) => a.ownerPin === true && (a.writes || []).includes(method));
  // always-PIN facade writes and the writes that need the PIN only under a condition (discount, override, not billed in CCPT, change of CCPT number, refund reversal)
  const pinPoints = ['cancelBill', 'issueCreditNote', 'refund', 'voidJob', 'setConfig', 'runMigration', 'decideLegacyAdvance', 'cancelNoChargeSheet', 'issueBill', 'addCcptNumber', 'reverseReceipt'];
  const missing = pinPoints.filter((m) => !reaches(m));
  assert.deepEqual(missing, [], 'Owner PIN points with no PIN control that reaches them');
  // no write action is without a stream
  for (const a of reg.actions.filter((x) => x.kind === 'write')) assert.ok(a.persists.length >= 1, a.id);
  const streamWrites = new Set(reg.actions.filter((a) => a.kind === 'write').flatMap((a) => a.persists));
  for (const s of PHASE2_STREAMS) assert.ok(streamWrites.has(s), 'some control writes ' + s);
});

test('T4.11 lifecycle: the register pins the listener and timer counts of every billing file, equal to what the MAH-4 counter measures', async () => {
  const { pathToFileURL } = await import('node:url');
  const path = await import('node:path');
  const { REPO } = await import('./lib/svc2-gov-common.mjs');
  const m = await import(pathToFileURL(path.join(REPO, 'scripts', 'lib', 'mah4-contract-source.mjs')).href);
  const ZERO = { timeouts: 0, clearTimeouts: 0, intervals: 0, clearIntervals: 0, mutationObservers: 0, observerDisconnects: 0, eventListeners: 0, removedEventListeners: 0, resizeListeners: 0 };
  for (const f of BILLING) {
    assert.ok(exists(f.file), 'waiting on writers: ' + f.file);
    const got = m.lifecycleCounts(readText(f.file));
    const budget = reg.lifecycleBudget[f.file];
    assert.notEqual(budget, undefined, 'the register has a lifecycle row for ' + f.file);
    assert.deepEqual(got, budget === 'zero' ? ZERO : budget, `${f.file} lifecycle changed; run the register tool if intended`);
    if (f.pure) assert.deepEqual(got, ZERO, 'a pure file has no listener and no timer');
  }
});

test('T4.12 every facade call the screens make exists on the facade and passes no more arguments than the facade method takes (the screens and the facade agree on the call shapes)', async () => {
  const { makeBillingEnv } = await import('./lib/svc2-gov-env.mjs');
  const { ADAPTER_CALLERS, calleeName } = await import('./lib/svc2-gov-common.mjs');
  const env = makeBillingEnv({ jobs: {} });
  assert.equal(env.waiting, undefined, 'waiting on writers: ' + (env.waiting || []).join(', '));
  const facade = env.bill;
  assert.equal(typeof facade, 'object', JSON.stringify(env.createResult));
  const problems = [];
  let seen = 0;
  for (const rel of Object.values(OWNER_FILE)) {
    assert.ok(exists(rel), 'waiting on writers: ' + rel);
    const ast = parseScript(readText(rel));
    // the adapter name table of the screen (SBU_BX or similar): name -> facade method; identity when the screen has none
    const map = {};
    walk(ast, (n) => {
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && /_BX$/.test(n.id.name) && n.init) {
        const obj = n.init.type === 'CallExpression' ? n.init.arguments[0] : n.init;
        if (obj && obj.type === 'ObjectExpression') for (const p of obj.properties) if (p.type === 'ObjectProperty' && p.value.type === 'StringLiteral') map[p.key.name || p.key.value] = p.value.value;
      }
    });
    walk(ast, (n) => {
      if (n.type !== 'CallExpression' || !ADAPTER_CALLERS.includes(calleeName(n.callee))) return;
      const a0 = n.arguments[0], a1 = n.arguments[1];
      if (!a0 || a0.type !== 'StringLiteral' || !a1 || a1.type !== 'ArrayExpression') return;
      const method = map[a0.value] || a0.value;
      const fn = facade[method];
      seen += 1;
      if (typeof fn !== 'function') { problems.push(`${rel}: ${a0.value} -> facade.${method} is not a function`); return; }
      if (a1.elements.some((e) => e && e.type === 'SpreadElement')) return;
      if (a1.elements.length > fn.length) problems.push(`${rel}: ${a0.value} passes ${a1.elements.length} arguments, facade.${method} takes ${fn.length} (at ${n.start})`);
    });
  }
  assert.ok(seen >= 10, 'the screens call the facade (waiting on W-UI and W-AREA)');
  assert.deepEqual([...new Set(problems)], []);
});
