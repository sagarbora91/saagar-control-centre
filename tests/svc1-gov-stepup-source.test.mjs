// Service wave 1, governance T5: the Owner PIN step-up pattern (PLAN 2.9 pattern P), checked on the source of the seven files.
// Pattern P for every Owner action: cheap checks, rights check, busy flag, reauth, strict "true" test, FRESH session read,
// owner test, then the core call with a step-up stamp. The core and docs layers never ask for a PIN; they only check the stamp.
// UI files may not use async/await (Babel helper globals), so the PIN call must flow through a promise chain.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SEVEN, exists, readText, loadJson, parseScript, walk, sourceOf } from './lib/svc1-gov-common.mjs';

const reg = loadJson('capability-register.json');
const SCREEN = [
  { owner: 'ui', file: 'www/service-stores-ui.js' },
  { owner: 'mui', file: 'www/service-stores-masters-ui.js' }
];
const calleeName = (c) => (c.type === 'Identifier' ? c.name : (c.type === 'MemberExpression' && !c.computed ? c.property.name : ''));

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

for (const f of SCREEN) {
  test(`T5.1 [${f.owner}] no async or await anywhere, so every reauth call flows through a promise chain`, () => {
    const { ast } = load(f.file);
    const hits = [];
    walk(ast, (n) => {
      if (n.type === 'AwaitExpression') hits.push('await at ' + n.start);
      if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression' || n.type === 'ObjectMethod') && n.async) hits.push('async at ' + n.start);
    });
    assert.deepEqual(hits, []);
  });

  test(`T5.2 [${f.owner}] a reauth result is never used as a truthy value (a Promise is always truthy)`, () => {
    const { ast } = load(f.file);
    const bad = [];
    for (const { node, parents } of reauthCalls(ast)) {
      const p = parents[parents.length - 1];
      const direct = p && (
        (p.type === 'IfStatement' && p.test === node) ||
        (p.type === 'LogicalExpression') ||
        (p.type === 'ConditionalExpression' && p.test === node) ||
        (p.type === 'UnaryExpression' && p.operator === '!') ||
        (p.type === 'WhileStatement') ||
        (p.type === 'BinaryExpression' && !/^(===|!==)$/.test(p.operator))
      );
      if (direct) bad.push(p.type + ' at ' + node.start);
      // `x = reauth(..)` then `if (x)` is the same bug: a variable holding the call must never be tested directly
      if (p && p.type === 'VariableDeclarator') bad.push('reauth promise stored in a variable at ' + node.start);
      if (p && p.type === 'AssignmentExpression') bad.push('reauth promise assigned at ' + node.start);
    }
    assert.deepEqual(bad, []);
  });

  test(`T5.3 [${f.owner}] each reauth is followed in the same handler by a strict true test, a fresh session read, an owner test, then the core call with the stamp`, () => {
    const { ast, src } = load(f.file);
    const calls = reauthCalls(ast);
    const problems = [];
    for (const { node, parents } of calls) {
      const fwd = parents.find((q) => q.type === 'ObjectProperty' && !q.computed && (q.key.name || q.key.value) === 'reauth');
      if (fwd) continue;
      let handler = null;
      for (let i = parents.length - 1; i >= 0; i--) if (parents[i].type === 'FunctionDeclaration') { handler = parents[i]; break; }
      if (!handler) { problems.push('reauth at ' + node.start + ' is not inside a named handler function'); continue; }
      const name = handler.id.name;
      let strict = -1, read = -1, ownerTest = -1, stamp = -1;
      walk(handler.body, (n) => {
        if (n.start <= node.start) return;
        if (n.type === 'BinaryExpression' && /^(===|!==)$/.test(n.operator) && (isTrue(n.left) || isTrue(n.right)) && strict < 0) strict = n.start;
        if (n.type === 'CallExpression' && /session/i.test(calleeName(n.callee)) && strict >= 0 && n.start > strict && read < 0) read = n.start;
        if (read >= 0 && n.start > read && ownerTest < 0 && ((n.type === 'MemberExpression' && !n.computed && n.property.name === 'isOwner') || (n.type === 'CallExpression' && /rights|owner/i.test(calleeName(n.callee))))) ownerTest = n.start;
        const stampLiteral = n.type === 'ObjectExpression' && ['ok', 'at'].every((k) => n.properties.some((q) => q.type === 'ObjectProperty' && (q.key.name || q.key.value) === k));
        if (ownerTest >= 0 && n.start > ownerTest && stamp < 0 && (stampLiteral || (n.type === 'ObjectProperty' && ((n.key.name || n.key.value) === 'stepUp')) || (n.type === 'Identifier' && /^(stepUp|stamp)$/.test(n.name)))) stamp = n.start;
      });
      if (strict < 0) problems.push(`${name}: no strict === true / !== true test after reauth`);
      else if (read < 0) problems.push(`${name}: the session is not read again after reauth`);
      else if (ownerTest < 0) problems.push(`${name}: no owner test after the second session read`);
      else if (stamp < 0) problems.push(`${name}: the core call does not carry a stepUp stamp after the owner test`);
    }
    assert.deepEqual(problems, [], 'pattern P broken in ' + f.file);
    assert.ok(src.length > 0);
  });

  test(`T5.4 [${f.owner}] every register action with an Owner PIN reaches a reauth call from its dispatch branch`, () => {
    const { ast } = load(f.file);
    const fnBodies = Object.create(null);
    walk(ast, (n) => {
      if (n.type === 'FunctionDeclaration' && n.id) (fnBodies[n.id.name] = fnBodies[n.id.name] || []).push(n.body);
      if (n.type === 'ObjectProperty' && n.value && /Function/.test(n.value.type)) { const k = n.key.name || n.key.value; if (k) (fnBodies[k] = fnBodies[k] || []).push(n.value.body); }
      if (n.type === 'ObjectMethod' && n.key.name) (fnBodies[n.key.name] = fnBodies[n.key.name] || []).push(n.body);
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && /Function/.test(n.init.type)) (fnBodies[n.id.name] = fnBodies[n.id.name] || []).push(n.init.body);
      if (n.type === 'AssignmentExpression' && n.right && /Function/.test(n.right.type) && n.left.type === 'MemberExpression' && n.left.property.name) (fnBodies[n.left.property.name] = fnBodies[n.left.property.name] || []).push(n.right.body);
    });
    const branches = (id) => {
      const out = [];
      walk(ast, (n, parents) => {
        if (n.type === 'SwitchCase' && n.test && n.test.type === 'StringLiteral' && n.test.value === id) {
          const sw = parents[parents.length - 1];
          let i = sw.cases.indexOf(n);
          while (i < sw.cases.length && sw.cases[i].consequent.length === 0) i += 1;
          if (i < sw.cases.length) out.push({ type: 'BlockStatement', body: sw.cases[i].consequent, start: sw.cases[i].start, end: sw.cases[i].end });
        }
        if (n.type === 'ObjectProperty' && n.key.type === 'StringLiteral' && n.key.value === id) out.push(n.value.body || n.value);
        if (n.type === 'IfStatement' && n.test.type === 'BinaryExpression' && [n.test.left, n.test.right].some((x) => x.type === 'StringLiteral' && x.value === id)) out.push(n.consequent);
      });
      return out;
    };
    const reaches = (root, seen, depth) => {
      let found = false;
      walk(root, (n) => {
        if (found) return false;
        if (n.type !== 'CallExpression') return;
        const nm = calleeName(n.callee);
        if (nm === 'reauth') { found = true; return false; }
        if (depth < 6 && nm && fnBodies[nm] && !seen.has(nm)) {
          seen.add(nm);
          for (const b of fnBodies[nm]) if (reaches(b, seen, depth + 1)) { found = true; return false; }
        }
      });
      return found;
    };
    const missing = [];
    const want = reg.actions.filter((a) => a.owner === f.owner && (a.ownerPin === true || a.ownerPin === 'conditional'));
    for (const a of want) {
      const bs = branches(a.id);
      if (bs.length === 0) { missing.push(a.id + ': no dispatch branch'); continue; }
      if (!bs.some((b) => reaches(b, new Set(), 0))) missing.push(a.id + ': no reauth reachable');
    }
    assert.deepEqual(missing, []);
    // and no PIN is asked for an action the register says needs none
    const none = reg.actions.filter((a) => a.owner === f.owner && a.ownerPin === false && a.kind !== 'dialog' && a.kind !== 'write');
    for (const a of none) for (const b of branches(a.id)) assert.equal(reaches(b, new Set(), 0), false, a.id + ' asks for a PIN but the register says it needs none');
  });

  test(`T5.5 [${f.owner}] the role is never kept: no long-lived variable or state field holds a session, role or tier`, () => {
    const { ast } = load(f.file);
    const bad = [];
    const NAME = /^(session|role|tier|isOwner|isManager|actor|actorName|ownerSession)$/i;
    const OBJ = /^(S|state|st|_state|STATE|cache|model|store)$/;
    walk(ast, (n, parents) => {
      if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && !n.left.computed && NAME.test(n.left.property.name)
        && n.left.object.type === 'Identifier' && OBJ.test(n.left.object.name)) bad.push(`${n.left.object.name}.${n.left.property.name} assigned at ${n.start}`);
      if (n.type === 'ObjectProperty' && !n.computed && NAME.test(n.key.name || n.key.value || '') && parents.some((p) => p.type === 'VariableDeclarator' && p.id.type === 'Identifier' && /^(S|state|st|_state|STATE|cache)$/.test(p.id.name))) bad.push(`state field ${n.key.name || n.key.value} at ${n.start}`);
      // a module-level (factory-level) variable named like a session cache
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && /^(cached|current|last|saved|_)?(Session|Role|Tier)$/i.test(n.id.name)) {
        const owner = parents.filter((p) => p.type === 'FunctionDeclaration' || p.type === 'FunctionExpression' || p.type === 'ArrowFunctionExpression');
        if (owner.length <= 1) bad.push(`factory-level variable ${n.id.name} at ${n.start}`);
      }
    });
    assert.deepEqual(bad, []);
  });
}

for (const f of SEVEN.filter((x) => x.pure)) {
  test(`T5.6 [${f.key}] the layer never asks for a PIN itself`, () => {
    const { ast } = load(f.file);
    assert.deepEqual(reauthCalls(ast).map((c) => c.node.start), [], f.file + ' must not call reauth; it checks the stamp it is given');
  });
}

test('T5.7 the documents layer and the masters layer check the stamp: 120,000 ms window, no future stamps', () => {
  for (const rel of ['www/service-stores-docs.js', 'www/service-stores-masters.js']) {
    const { src } = load(rel);
    assert.ok(/120000/.test(src), rel + ' holds the 2 minute window');
    assert.ok(/PIN_REQUIRED/.test(src), rel + ' refuses with PIN_REQUIRED');
    assert.ok(/\bstepUp\b/.test(src), rel + ' reads ctx.stepUp');
  }
  const docs = load('www/service-stores-docs.js').src;
  const i = docs.indexOf('function stepUpOk(ctx)');
  assert.ok(i >= 0, 'stepUpOk exists');
  // gov-audit: read the real function bodies (stepUpOk plus any helper it calls, e.g. stampAt), not a fixed slice of text
  const fnText = (src, name) => {
    let out = '';
    walk(parseScript(src), (n) => { if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) out += sourceOf(src, n); });
    return out;
  };
  const own = fnText(docs, 'stepUpOk');
  const helpers = [...own.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]).filter((n) => n !== 'stepUpOk' && n !== 'function');
  const body = own + helpers.map((h) => fnText(docs, h)).join('\n');
  assert.ok(/ok\s*[!=]==\s*true/.test(body), 'the stamp must be tested for ok === true');
  assert.ok(/>=\s*0|<\s*0/.test(body), 'a future stamp (negative age) is refused');
  const mas = load('www/service-stores-masters.js').src;
  const j = mas.indexOf('function masStepUpValid');
  assert.ok(j >= 0, 'masStepUpValid exists');
  const mbody = fnText(mas, 'masStepUpValid');
  assert.ok(/ok\s*[!=]==\s*true/.test(mbody) && />=\s*0|<\s*0/.test(mbody), 'masters checks ok and a non-negative age');
  assert.ok(/120000|WINDOW_MS|FRESH_MS/.test(body) && /WINDOW_MS|120000/.test(mbody), 'both checks bound the age from above');
});

function isTrue(n) { return n && n.type === 'BooleanLiteral' && n.value === true; }
void sourceOf;
