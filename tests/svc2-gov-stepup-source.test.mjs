// Service wave 2, governance T5: the Owner PIN step-up pattern (Phase 1 plan 2.9 pattern P; wave-2 plan 2.9, 2.11, DEF-1) on the billing sources and on the real stack.
// Pattern P for every Owner action: cheap checks, rights check, busy flag, reauth, strict "true" test, FRESH session read,
// owner test, then the facade call. The facade, docs and money layers never ask for a PIN; they only check the stamp (provider stepUpAt, 120000 ms).
// UI files may not use async/await (Babel helper globals), so the PIN call must flow through a promise chain.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BILLING, BILLING_PURE, BILLING_SCREEN, exists, readText, loadJson, parseScript, walk, sourceOf, calleeName, functionBodies, branchesOf, reachesCall, namesCall,
  FACADE_WRITES, realSession, reachesWrite
} from './lib/svc2-gov-common.mjs';
import { build as buildMoney, OWNER as M_OWNER, MANAGER as M_MANAGER, refused, good } from './lib/svc2-money-kit.mjs';
import { makeBillingEnv, seedBillingFlow, seedPinTargets, govJobs } from './lib/svc2-gov-env.mjs';
import { SESSIONS } from './lib/fix-s15-role-table.mjs';

const reg = loadJson('capability-register.json');
// Facade writes that always need the Owner PIN, and writes that need it only under a condition (discount above the limit, approval override,
// not billed in CCPT, a changed CCPT number, a refund reversal). Plan 2.11.
const ALWAYS_PIN = ['cancelBill', 'issueCreditNote', 'refund', 'voidJob', 'setConfig', 'runMigration', 'decideLegacyAdvance', 'cancelNoChargeSheet'];
const COND_PIN = ['issueBill', 'addCcptNumber', 'reverseReceipt'];

function load(rel) {
  assert.ok(exists(rel), 'waiting on writers: ' + rel);
  const src = readText(rel);
  return { src, ast: parseScript(src) };
}
function reauthCalls(ast) {
  const out = [];
  walk(ast, (n, parents) => { if (n.type === 'CallExpression' && calleeName(n.callee) === 'reauth') out.push({ node: n, parents: parents.slice() }); });
  return out;
}
const isTrue = (n) => n && n.type === 'BooleanLiteral' && n.value === true;
// the area's PIN asker handed to the kit: `f = kitFn('ownerStep')` ... `f(label, work, ref, function (l) { return H.reauth(l); })`
function delegatesToKit(handler, node, parents) {
  const fnIdx = parents.map((q) => q.type).lastIndexOf('FunctionExpression');
  const fnArrow = parents.map((q) => q.type).lastIndexOf('ArrowFunctionExpression');
  const k = Math.max(fnIdx, fnArrow);
  if (k < 1) return false;
  const asker = parents[k];
  const call = parents[k - 1];
  const body = asker.body.type === 'BlockStatement' ? asker.body.body : null;
  const only = asker.body === node || (body && body.length === 1 && body[0].type === 'ReturnStatement' && body[0].argument === node);
  if (!only || !call || call.type !== 'CallExpression' || !call.arguments.includes(asker) || call.callee.type !== 'Identifier') return false;
  let fromKit = false;
  walk(handler.body, (n) => {
    const init = n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === call.callee.name ? n.init
      : (n.type === 'AssignmentExpression' && n.left.type === 'Identifier' && n.left.name === call.callee.name ? n.right : null);
    if (init && init.type === 'CallExpression' && calleeName(init.callee) === 'kitFn' && init.arguments[0] && init.arguments[0].value === 'ownerStep') fromKit = true;
  });
  if (!fromKit) return false;
  // the kit's ownerStep (main UI file) takes the asker as a parameter and calls it
  const ui = BILLING_SCREEN.find((x) => x.key === 'ui');
  const uiAst = parseScript(readText(ui.file));
  let ok = false;
  walk(uiAst, (n) => {
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === 'ownerStep' && n.params.length >= 4 && n.params[3].type === 'Identifier') {
      const ask = n.params[3].name;
      walk(n.body, (m) => { if (m.type === 'CallExpression' && m.callee.type === 'Identifier' && m.callee.name === ask) ok = true; });
    }
  });
  return ok;
}

for (const f of BILLING_SCREEN) {
  test(`T5.1 [${f.key}] no async or await anywhere, so every reauth call flows through a promise chain`, () => {
    const { ast } = load(f.file);
    const hits = [];
    walk(ast, (n) => {
      if (n.type === 'AwaitExpression') hits.push('await at ' + n.start);
      if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression' || n.type === 'ObjectMethod') && n.async) hits.push('async at ' + n.start);
    });
    assert.deepEqual(hits, []);
  });

  test(`T5.2 [${f.key}] a reauth result is never used as a truthy value (a Promise is always truthy)`, () => {
    const { ast } = load(f.file);
    const bad = [];
    for (const { node, parents } of reauthCalls(ast)) {
      const p = parents[parents.length - 1];
      const direct = p && (
        (p.type === 'IfStatement' && p.test === node) || p.type === 'LogicalExpression' ||
        (p.type === 'ConditionalExpression' && p.test === node) || (p.type === 'UnaryExpression' && p.operator === '!') ||
        p.type === 'WhileStatement' || (p.type === 'BinaryExpression' && !/^(===|!==)$/.test(p.operator))
      );
      if (direct) bad.push(p.type + ' at ' + node.start);
      if (p && p.type === 'VariableDeclarator') bad.push('reauth promise stored in a variable at ' + node.start);
      if (p && p.type === 'AssignmentExpression') bad.push('reauth promise assigned at ' + node.start);
    }
    assert.deepEqual(bad, []);
  });

  test(`T5.3 [${f.key}] each reauth is followed in the same handler by a strict true test, a FRESH session read, an owner test, then the facade write`, () => {
    const { ast } = load(f.file);
    const problems = [];
    for (const { node, parents } of reauthCalls(ast)) {
      const fwd = parents.find((q) => q.type === 'ObjectProperty' && !q.computed && (q.key.name || q.key.value) === 'reauth');
      if (fwd) continue;
      let handler = null;
      for (let i = parents.length - 1; i >= 0; i--) if (parents[i].type === 'FunctionDeclaration') { handler = parents[i]; break; }
      if (!handler) { problems.push('reauth at ' + node.start + ' is not inside a named handler function'); continue; }
      // One delegation is allowed (A-MIG audit 2026-11-19, rule A2-02: the Owner step lives once, in the main UI kit): the reauth call is
      // the whole body of a function handed as an argument to the kit's ownerStep, taken in the same handler as `x = kitFn('ownerStep')`.
      // The kit's ownerStep must then take that asker and is itself held to this pattern in the main UI file.
      if (delegatesToKit(handler, node, parents)) continue;
      const name = handler.id.name;
      let strict = -1, read = -1, ownerTest = -1, write = -1;
      const paramNames = handler.params.filter((q) => q.type === 'Identifier').map((q) => q.name); // the `work` callback of the step: the write happens in it, after the owner test
      walk(handler.body, (n) => {
        if (n.start <= node.start) return;
        if (n.type === 'BinaryExpression' && /^(===|!==)$/.test(n.operator) && (isTrue(n.left) || isTrue(n.right)) && strict < 0) strict = n.start;
        if (n.type === 'CallExpression' && /session/i.test(calleeName(n.callee)) && strict >= 0 && n.start > strict && read < 0) read = n.start;
        if (read >= 0 && n.start > read && ownerTest < 0 && ((n.type === 'MemberExpression' && !n.computed && n.property.name === 'isOwner') || (n.type === 'CallExpression' && /rights|owner/i.test(calleeName(n.callee))))) ownerTest = n.start;
        if (ownerTest >= 0 && n.start > ownerTest && write < 0 && n.type === 'CallExpression' && (FACADE_WRITES.includes(calleeName(n.callee)) || (n.callee.type === 'Identifier' && paramNames.includes(n.callee.name)))) write = n.start;
      });
      if (strict < 0) problems.push(`${name}: no strict === true / !== true test after reauth`);
      else if (read < 0) problems.push(`${name}: the session is not read again after reauth`);
      else if (ownerTest < 0) problems.push(`${name}: no owner test after the second session read`);
      else if (write < 0) problems.push(`${name}: no facade write call after the owner test (the PIN time comes from the stepUpAt provider, so no stamp object is passed)`);
    }
    assert.deepEqual(problems, [], 'pattern P broken in ' + f.file);
  });

  test(`T5.4 [${f.key}] every register control that reaches a PIN-needing write asks for the PIN, and no control asks for a PIN without such a write`, () => {
    const { ast } = load(f.file);
    const fnBodies = functionBodies(ast);
    const problems = [];
    const rows = reg.actions.filter((a) => a.owner === f.key);
    for (const a of rows) {
      const bs = branchesOf(ast, a.id);
      if (bs.length === 0) { problems.push(a.id + ': no dispatch branch'); continue; }
      const asks = bs.some((b) => reachesCall(b, fnBodies, (nm) => nm === 'reauth'));
      const always = ALWAYS_PIN.filter((w) => bs.some((b) => reachesWrite(b, fnBodies, w)));
      const cond = COND_PIN.filter((w) => bs.some((b) => reachesWrite(b, fnBodies, w)));
      if (always.length && !asks) problems.push(`${a.id}: reaches ${always.join(',')} (always needs the Owner PIN) but never asks for it`);
      if (asks && !always.length && !cond.length) problems.push(`${a.id}: asks for a PIN but reaches no write that needs one`);
    }
    assert.deepEqual(problems, []);
  });

  test(`T5.5 [${f.key}] the role is never kept: no long-lived variable or state field holds a session, role or tier`, () => {
    const { ast } = load(f.file);
    const bad = [];
    const NAME = /^(session|role|tier|isOwner|isManager|actor|actorName|ownerSession)$/i;
    const OBJ = /^(S|state|st|_state|STATE|cache|model|store)$/;
    walk(ast, (n, parents) => {
      if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && !n.left.computed && NAME.test(n.left.property.name)
        && n.left.object.type === 'Identifier' && OBJ.test(n.left.object.name)) bad.push(`${n.left.object.name}.${n.left.property.name} assigned at ${n.start}`);
      if (n.type === 'ObjectProperty' && !n.computed && NAME.test(n.key.name || n.key.value || '') && parents.some((p) => p.type === 'VariableDeclarator' && p.id.type === 'Identifier' && /^(S|state|st|_state|STATE|cache)$/.test(p.id.name))) bad.push(`state field ${n.key.name || n.key.value} at ${n.start}`);
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && /^(cached|current|last|saved|_)?(Session|Role|Tier)$/i.test(n.id.name)) {
        const owner = parents.filter((p) => p.type === 'FunctionDeclaration' || p.type === 'FunctionExpression' || p.type === 'ArrowFunctionExpression');
        if (owner.length <= 1) bad.push(`factory-level variable ${n.id.name} at ${n.start}`);
      }
    });
    assert.deepEqual(bad, []);
  });
}

for (const f of BILLING_PURE) {
  test(`T5.6 [${f.key}] the layer never asks for a PIN itself`, () => {
    const { ast } = load(f.file);
    assert.deepEqual(reauthCalls(ast).map((c) => c.node.start), [], f.file + ' must not call reauth; it checks the stamp it is given');
  });
}

test('T5.7 docs, money and the facade bound the stamp age: 120000 ms, a stamp from the future is refused, PIN_REQUIRED is the refusal', () => {
  for (const f of [BILLING.find((x) => x.key === 'docs'), BILLING.find((x) => x.key === 'money'), BILLING.find((x) => x.key === 'core')]) {
    const { src } = load(f.file);
    assert.ok(/120000/.test(src), f.file + ' holds the 2 minute window');
    assert.ok(/PIN_REQUIRED/.test(src), f.file + ' refuses with PIN_REQUIRED');
    assert.ok(/\bstepUp(At)?\b/.test(src), f.file + ' reads the stamp');
  }
  const { src: money } = load('www/service-billing-money.js');
  const i = money.indexOf('function stampAt(ctx)');
  assert.ok(i >= 0, 'money.stampAt exists');
  const body = money.slice(i, i + 700);
  assert.ok(/ok\s*!==\s*true|ok\s*===\s*true/.test(body), 'money tests the stamp for ok === true');
  assert.ok(/diff\s*>=\s*0|>=\s*0/.test(body), 'a future stamp (negative age) is refused');
  assert.ok(/<=\s*SBM_PIN_FRESH_MS|<=\s*120000/.test(body), 'the age is bounded from above');
  const { src: core } = load('www/service-billing-core.js');
  assert.ok(/>=\s*0|0\s*<=/.test(core) && /<=\s*SBX_STEP_UP_MS|<=\s*120000/.test(core), 'the facade bounds the provider stamp from both sides');
});

// ---------- behaviour on the real money layer (runs today) ----------
test('T5.8 money: refund refuses every junk stamp with PIN_REQUIRED and writes nothing; 120000 ms old is accepted, 120001 is not', () => {
  const h = buildMoney();
  h.cases.add('J-1');
  good(h.api.takeAdvance({ jobId: 'J-1', amountPaise: 50000, payMode: 'Cash', payRef: '', note: '' }, h.ctx(M_OWNER)));
  const now = Date.parse(h.clock.iso);
  const input = (n) => ({ jobId: 'J-1', amountPaise: 1000, payMode: 'Cash', reason: 'customer took it back ' + n });
  const bad = [undefined, null, {}, { ok: false, at: now }, { ok: true }, { ok: true, at: 'now' }, { ok: true, at: now - 120001 }, { ok: true, at: now + 1000 }, { ok: 1, at: now },
    { ok: true, at: NaN }, { ok: true, at: Infinity }, { ok: true, at: String(now) }, { ok: 'true', at: now }, { ok: true, at: [now] }, true, 'ok', now, { ok: true, at: now + 0.5 }];
  const before = h.text();
  for (const stamp of bad) {
    const ctx = stamp === undefined ? { session: M_OWNER } : { session: M_OWNER, stepUp: stamp };
    refused(h, h.api.refund(input('x'), ctx), 'PIN_REQUIRED', before);
  }
  refused(h, h.api.refund(input('m'), { session: M_MANAGER, stepUp: { ok: true, at: now } }), 'NOT_ALLOWED', before);
  good(h.api.refund(input('edge'), { session: M_OWNER, stepUp: { ok: true, at: now - 120000 } }));
  refused(h, h.api.refund(input('late'), { session: M_OWNER, stepUp: { ok: true, at: now - 120001 } }), 'PIN_REQUIRED');
});

// ---------- behaviour on the real stack through the facade ----------
// With the providers given (DEF-1) the caller's stepUp object only says "this call wants the PIN"; the TIME comes from the stepUpAt provider (env.pin).
const WANTS = { ok: true, at: 0 };
function stack() {
  const env = makeBillingEnv({ jobs: govJobs() });
  assert.equal(env.waiting, undefined, 'waiting on writers: ' + (env.waiting || []).join(', '));
  const owner = realSession(SESSIONS[0].read);
  const manager = realSession(SESSIONS.find((s) => s.name === 'role Store Manager').read);
  const ids = seedBillingFlow(env, { owner, manager });
  Object.assign(ids, seedPinTargets(env, { owner, manager }));
  return { env, ids, owner, manager };
}
const pinOps = (ids) => [
  ['cancelBill', (B, c) => B.cancelBill({ invoiceNo: ids.invoiceNo4, reason: 'invented wrong bill again' }, c)],
  ['issueCreditNote', (B, c) => B.issueCreditNote({ invoiceNo: ids.invoiceNo, mode: 'PARTIAL', reasonClass: 'PRICE', reason: 'invented second correction', request: { kind: 'LINES', lines: [{ lineNo: 2, taxablePaise: 100 }] }, stock: [], note: '' }, c)],
  ['refund', (B, c) => B.refund({ jobId: 'WS-2026-001', cnNo: ids.cnNo, amountPaise: 100, payMode: 'Cash', payRef: '', reason: 'invented refund probe' }, c)],
  ['voidJob', (B, c) => B.voidJob({ jobId: 'WS-2026-005', reason: 'invented duplicate job' }, c)],
  ['setConfig', (B, c) => B.setConfig({ discountLimitPaise: 1000, billingRoles: ['Cashier'], estimateRoles: ['Technician'] }, c)],
  ['cancelNoChargeSheet', (B, c) => B.cancelNoChargeSheet({ sheetId: ids.sheetId, reason: 'invented wrong sheet' }, c)],
  ['decideLegacyAdvance', (B, c) => B.decideLegacyAdvance({ jobId: 'WS-2026-007', decision: 'IN_BOOK', amountPaise: 20000 }, c)]
];

test('T5.9 facade: every always-PIN write refuses a missing, stale, future or junk PIN time with PIN_REQUIRED and writes nothing', () => {
  const { env, ids, owner } = stack();
  const before = env.fingerprint();
  const sets = env.adapter.setCount;
  const failures = [];
  const times = [null, -1, 120001, 3600000, -1000, 'junk', NaN, Infinity];
  for (const t of times) {
    for (const [name, call] of pinOps(ids)) {
      env.as(owner);
      if (t === null) env.noPin();
      else if (typeof t === 'number' && Number.isFinite(t)) env.pin(t);
      else env.noPin();
      const r = call(env.bill, { clientRef: 'gov2-bad-' + name + '-' + String(t), stepUp: WANTS });
      if (!r || r.ok !== false) failures.push(name + ' with PIN time ' + String(t) + ' was not refused');
      else if (r.code !== 'PIN_REQUIRED') failures.push(name + ' with PIN time ' + String(t) + ' gave ' + r.code);
    }
  }
  assert.deepEqual(failures.slice(0, 10), []);
  assert.equal(env.adapter.setCount, sets, 'no storage write at all');
  assert.equal(env.fingerprint(), before);
});

test('T5.10 facade: the PIN window is exactly 0 to 120000 ms (void job as the probe: 120000 accepted, 120001 not)', () => {
  const { env, owner } = stack();
  env.as(owner).pin(120001);
  let r = env.bill.voidJob({ jobId: 'WS-2026-005', reason: 'invented duplicate job' }, env.ctx(owner, { stepUp: { ok: true, at: env.clock.ms - 120001 } }));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'PIN_REQUIRED');
  r = env.bill.voidJob({ jobId: 'WS-2026-005', reason: 'invented duplicate job' }, env.ctx(owner, { stepUp: { ok: true, at: env.clock.ms - 120000 } }));
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('T5.11 facade: role downgrade between the PIN and the write: the write reads the NEW session, is refused and writes nothing; the Owner with the same time is accepted', () => {
  const { env, ids, owner, manager } = stack();
  const cashier = realSession(SESSIONS.find((s) => s.name === 'role Cashier').read);
  const before = env.fingerprint();
  const sets = env.adapter.setCount;
  for (const down of [manager, cashier]) {
    for (const [name, call] of pinOps(ids)) {
      env.as(owner).pin(0);          // the PIN was entered as the Owner
      env.as(down);                  // the session changed before the write
      const r = call(env.bill, { clientRef: 'gov2-down-' + name, stepUp: WANTS });
      assert.equal(r.ok, false, name + ' must be refused after a downgrade');
      assert.notEqual(r.code, 'PIN_REQUIRED', name + ': the refusal is about the role, the PIN time was fresh');
    }
  }
  assert.equal(env.adapter.setCount, sets);
  assert.equal(env.fingerprint(), before);
  env.as(owner).pin(0);
  const ok = env.bill.voidJob({ jobId: 'WS-2026-005', reason: 'invented duplicate job' }, { clientRef: 'gov2-ok-void', stepUp: WANTS });
  assert.equal(ok.ok, true, JSON.stringify(ok));
});

test('T5.12 facade: the Store Manager is refused every Owner-only action even with a fresh PIN time, before any write', () => {
  const { env, ids, manager } = stack();
  const before = env.fingerprint();
  const sets = env.adapter.setCount;
  for (const [name, call] of pinOps(ids)) {
    env.as(manager).pin(0);
    const r = call(env.bill, { clientRef: 'gov2-mgr-' + name, stepUp: WANTS });
    assert.equal(r.ok, false, name + ' must be refused for a Store Manager');
  }
  assert.equal(env.adapter.setCount, sets);
  assert.equal(env.fingerprint(), before);
});

test('T5.13 facade: a ctx.session or ctx.stepUp passed by the caller is ignored when the providers are given (DEF-1)', () => {
  const { env, ids, owner, manager } = stack();
  const before = env.fingerprint();
  env.as(manager).noPin();
  const forged = { session: owner, stepUp: { ok: true, at: env.clock.ms }, clientRef: 'gov2-forged' };
  const r = env.bill.voidJob({ jobId: 'WS-2026-005', reason: 'invented duplicate job' }, forged);
  assert.equal(r.ok, false, 'a forged ctx must not give the Owner rights');
  assert.equal(env.fingerprint(), before);
  void ids;
});
