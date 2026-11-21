import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadModuleBundle } from './lib/module-bundle.mjs';

const shell = fs.readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
const moduleBundle = loadModuleBundle();

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractFunction(name) {
  const match = new RegExp(
    String.raw`(?:async\s+)?function\s+${escapeRegExp(name)}\s*\(`
  ).exec(shell);
  assert.ok(match, `expected function ${name}`);
  const start = match.index;
  const open = shell.indexOf('{', start + match[0].length);
  assert.ok(open >= 0, `expected opening brace for ${name}`);

  let depth = 0;
  let state = 'code';
  let escaped = false;
  let regexClass = false;
  let previousSignificant = '';

  for (let i = open; i < shell.length; i += 1) {
    const ch = shell[i];
    const next = shell[i + 1];
    if (state === 'line-comment') {
      if (ch === '\n') state = 'code';
      continue;
    }
    if (state === 'block-comment') {
      if (ch === '*' && next === '/') { state = 'code'; i += 1; }
      continue;
    }
    if (state === 'single' || state === 'double' || state === 'template') {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if ((state === 'single' && ch === "'") ||
          (state === 'double' && ch === '"') ||
          (state === 'template' && ch === '`')) state = 'code';
      continue;
    }
    if (state === 'regex') {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '[') regexClass = true;
      if (ch === ']') regexClass = false;
      if (ch === '/' && !regexClass) state = 'code';
      continue;
    }
    if (ch === '/' && next === '/') { state = 'line-comment'; i += 1; continue; }
    if (ch === '/' && next === '*') { state = 'block-comment'; i += 1; continue; }
    if (ch === "'") { state = 'single'; continue; }
    if (ch === '"') { state = 'double'; continue; }
    if (ch === '`') { state = 'template'; continue; }
    if (ch === '/' && /[=(:,!&|?;{}[\]]/.test(previousSignificant || '=')) {
      state = 'regex'; regexClass = false; continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return shell.slice(start, i + 1);
    }
    if (!/\s/.test(ch)) previousSignificant = ch;
  }
  assert.fail(`unterminated function ${name}`);
}

function decodedModule(id) {
  const mod = moduleBundle.find(function (value) { return value.id === id; });
  assert.ok(mod, 'expected ' + id + ' module');
  return mod.html;
}

function applyTransform(name, input, moduleId) {
  const context = vm.createContext({
    input,
    moduleId,
    output: null,
    __injBeforeBodyEnd(html, fragment) {
      const at = html.toLowerCase().lastIndexOf('</body>');
      return at >= 0 ? html.slice(0, at) + fragment + '\n' + html.slice(at) : html + fragment;
    }
  });
  vm.runInContext(
    `${extractFunction(name)}\noutput = ${name}(input, moduleId);`,
    context,
    { filename: `${name}.security-regression.js` }
  );
  assert.equal(typeof context.output, 'string');
  return context.output;
}

function runtimeModule(id) {
  return decodedModule(id);
}

test('successful module-entry approval cannot elevate or persist an Owner session', () => {
  const access = extractFunction('ensureModuleAccess');
  const verifyOnly = extractFunction('promptVerifyOnlyResult');
  const ownerMutation = /\b(?:setAdmin|unlockAdmin)\s*\(|\bisAdmin\s*=|ADMIN_MODE_KEY/;

  assert.doesNotMatch(access, ownerMutation);
  assert.doesNotMatch(verifyOnly, ownerMutation);

  const context = vm.createContext({ result: null, ownerAfter: null });
  vm.runInContext(`
    let isAdmin = false;
    function roleCanOpen(){ return true; }
    function moduleById(){ return {short:'Stock',title:'Stock Register'}; }
    function currentRole(){ return 'Store Manager'; }
    function modulePinRequired(){ return true; }
    function promptVerifyOnlyResult(){ return {ok:true,status:'approved'}; }
    function auditLog(){}
    function toast(){}
    function setAdmin(){ throw new Error('module entry attempted Owner elevation'); }
    function unlockAdmin(){ throw new Error('module entry attempted Owner unlock'); }
    ${access}
    result = ensureModuleAccess('stock');
    ownerAfter = isAdmin;
  `, context, { filename: 'module-entry-no-elevation.js' });

  assert.equal(context.result, true);
  assert.equal(context.ownerAfter, false);
});

test('fresh action reauthentication is independent of module entry and active Owner mode', () => {
  const reauth = extractFunction('SaagarReauth');

  assert.match(reauth, /await reauthKeypadResult\s*\(/);
  assert.match(reauth, /catch\s*\(e\)\s*\{result=\{ok:false/);
  assert.doesNotMatch(reauth, /promptVerifyOnlyResult\s*\(/);
  assert.doesNotMatch(reauth, /modulePinRequired|ensureModuleAccess/);
  assert.doesNotMatch(reauth, /\bisAdmin\b/);
  assert.doesNotMatch(reauth, /\bsetAdmin\s*\(/);
});

test('runtime module transforms preserve existing sensitive-action reauthentication gates', () => {
  const sharedRuntime = fs.readFileSync(new URL('../www/shared/module-runtime.js', import.meta.url), 'utf8');
  assert.match(sharedRuntime, /(?:window\.parent|parent).*SaagarReauth|root\.SaagarReauth/);
  const contracts = {
    stock: {
      helper: 'stReauth', minimumGates: 3,
      reasons: ['Lock the Opening Stock count', 'Lock and sign off the Closing Stock count', 'Re-open a locked section']
    },
    service: {
      helper: 'svcD3Reauth', minimumGates: 1,
      reasons: ['Override Service stage']
    },
    dsr: {
      helper: 'stReauth', minimumGates: 2,
      reasons: ['Sign off the DSR audit', 'Unlock a submitted DSR and DISCARD its audit']
    },
    expense: {
      helper: 'stReauth', minimumGates: 4,
      reasons: ['Override the tax-locked month', 'Edit an entry in the tax-locked month', 'Void an entry in the tax-locked month', 'Post a recurring entry into the tax-locked month']
    },
    payroll: {
      helper: 'stReauth', minimumGates: 5,
      reasons: ['Delete advance voucher', 'Issue a FULL & FINAL settlement', 'Lock the pay-run', 'Unlock the pay-run and DISCARD the frozen snapshot', 'and reset attendance']
    }
  };

  for (const [moduleId, contract] of Object.entries(contracts)) {
    const runtime = runtimeModule(moduleId);
    const calls = runtime.match(
      new RegExp(`\\b${escapeRegExp(contract.helper)}\\s*\\(`, 'g')
    ) || [];
    assert.ok(
      calls.length >= contract.minimumGates,
      `${moduleId} must retain ${contract.minimumGates} sensitive-action gates`
    );
    if (contract.helper === 'stReauth') assert.match(runtime, /const stReauth=SaagarModuleRuntime\.reauth/);
    contract.reasons.forEach(reason => {
      assert.ok(runtime.includes(reason), `${moduleId} lost reauth reason: ${reason}`);
    });
    if (moduleId === 'service') {
      assert.match(
        runtime,
        /overrideApproved\s*=\s*await\s+svcD3Reauth\s*\([\s\S]{0,500}if\s*\(\s*!overrideApproved\s*\)[\s\S]{0,220}return\s*;/
      );
    }
  }
});

test('Owner and role changes notify open modules and revoke stale manager workspaces', () => {
  const applyMode = extractFunction('applyMode');
  const setAdmin = extractFunction('setAdmin');
  const setCurrentRole = extractFunction('setCurrentRole');
  const bridge = fs.readFileSync(new URL('../www/shared/module-runtime.js', import.meta.url), 'utf8');

  assert.match(applyMode, /notifyModuleAccessChanged\s*\(/);
  assert.match(setAdmin, /applyMode\s*\(/);
  assert.match(setCurrentRole, /applyMode\s*\(/);
  assert.match(bridge, /accepts\(event,window\.parent\)/);
  assert.match(bridge, /ST_ACCESS_CONTEXT/);
  assert.match(bridge, /revokeManagerIfNeeded\s*\(/);
  assert.match(bridge, /moduleId==='stock'[\s\S]*commitMode\('cro'\)/);
  assert.match(bridge, /moduleId==='dsr'[\s\S]*logout\s*\(/);
});
