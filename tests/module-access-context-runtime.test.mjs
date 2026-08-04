import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const shell = fs.readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');

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

function moduleRegistry() {
  const match = shell.match(/\bconst\s+MODULES\s*=\s*(\[[\s\S]*?\])\s*;/);
  assert.ok(match, 'expected injected MODULES registry');
  return JSON.parse(match[1]);
}

function decodedModule(id) {
  const mod = moduleRegistry().find(value => value.id === id);
  assert.ok(mod, `expected ${id} module`);
  return mod.html_b64
    ? Buffer.from(mod.html_b64, 'base64').toString('utf8')
    : fs.readFileSync(new URL(`../www/${mod.src}`, import.meta.url), 'utf8');
}

function injectedAccessScript(moduleId) {
  const context = vm.createContext({
    input: decodedModule(moduleId),
    moduleId,
    output: null,
    __injBeforeBodyEnd(html, fragment) {
      const at = html.toLowerCase().lastIndexOf('</body>');
      return at >= 0 ? html.slice(0, at) + fragment + '\n' + html.slice(at) : html + fragment;
    }
  });
  vm.runInContext(
    `${extractFunction('injectModuleAccessBridge')}\n` +
      'output = injectModuleAccessBridge(input, moduleId);',
    context,
    { filename: 'injectModuleAccessBridge.runtime-test.js' }
  );
  const match = context.output.match(
    /<script id="st-v5-module-access-bridge">([\s\S]*?)<\/script>/
  );
  assert.ok(match, `expected injected access bridge for ${moduleId}`);
  return match[1];
}

function accessContext({ owner = false, role = 'Cashier' } = {}) {
  return {
    version: 1,
    isOwner: owner,
    role,
    isManager: owner || role === 'Store Manager'
  };
}

function moduleHarness(moduleId, initialContext) {
  let current = { ...initialContext };
  const listeners = {};
  const calls = {
    commits: [],
    originalModes: [],
    originalTabs: [],
    originalLoginRoles: [],
    screens: [],
    smTabs: [],
    logouts: 0,
    messages: [],
    renderDash: 0,
    render: 0
  };
  const elements = {
    'login-err': { textContent: '' },
    'sm-auth-modal': { style: { display: 'block' } },
    'sm-pw-inp': { parentElement: { style: { display: '' } } }
  };
  const loginButton = { textContent: '' };
  const parentWindow = {
    SaagarOwnerSession: { read: () => ({ ...current }) }
  };
  const sandbox = {
    console,
    parent: parentWindow,
    document: {
      getElementById: id => elements[id] || null,
      querySelector: selector => selector === '#lform-sm .btn-login' ? loginButton : null
    },
    st: { mode: 'cro', screen: 'staff' },
    toast: text => calls.messages.push(String(text)),
    commitMode: mode => { calls.commits.push(mode); sandbox.st.mode = mode; },
    setMode: mode => { calls.originalModes.push(mode); sandbox.st.mode = mode; },
    goTab: tab => calls.originalTabs.push(tab),
    setLoginRole: role => calls.originalLoginRoles.push(role),
    showScreen: screen => { calls.screens.push(screen); sandbox.st.screen = screen; },
    goSMTab: tab => calls.smTabs.push(tab),
    logout: () => { calls.logouts += 1; sandbox.st.screen = 'staff'; },
    renderDash: () => { calls.renderDash += 1; },
    render: () => { calls.render += 1; },
    addEventListener: (type, handler) => { listeners[type] = handler; }
  };
  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(injectedAccessScript(moduleId), context, {
    filename: `${moduleId}.access-context-runtime.js`
  });

  return {
    window: sandbox,
    calls,
    elements,
    loginButton,
    update(nextContext) {
      current = { ...nextContext };
      assert.equal(typeof listeners.message, 'function');
      listeners.message({
        source: parentWindow,
        data: { type: 'ST_ACCESS_CONTEXT' }
      });
    }
  };
}

test('Stock manager workspace allows shell Owner/Store Manager and denies lower roles', () => {
  assert.match(
    extractFunction('moduleAccessSnapshot'),
    /isManager:isAdmin===true\|\|role==='Store Manager'/
  );

  for (const context of [
    accessContext({ owner: true, role: 'Cashier' }),
    accessContext({ role: 'Store Manager' })
  ]) {
    const harness = moduleHarness('stock', context);
    harness.window.setMode('sm');
    assert.equal(harness.window.st.mode, 'sm');
    assert.deepEqual(harness.calls.commits, ['sm']);
  }

  for (const role of ['Cashier', 'CRO', 'Technician']) {
    const harness = moduleHarness('stock', accessContext({ role }));
    harness.window.setMode('sm');
    assert.equal(harness.window.st.mode, 'cro');
    assert.deepEqual(harness.calls.commits, []);
    assert.match(harness.calls.messages.join(' '), /Switch to Owner or Store Manager/);
  }
});

test('DSR manager workspace allows shell Owner/Store Manager and denies lower roles', () => {
  for (const context of [
    accessContext({ owner: true, role: 'Cashier' }),
    accessContext({ role: 'Store Manager' })
  ]) {
    const harness = moduleHarness('dsr', context);
    harness.window.setLoginRole('sm');
    assert.deepEqual(harness.calls.screens, ['sm']);
    assert.deepEqual(harness.calls.smTabs, ['submissions']);
    assert.deepEqual(harness.calls.originalLoginRoles, []);
  }

  for (const role of ['Cashier', 'CRO', 'Technician']) {
    const harness = moduleHarness('dsr', accessContext({ role }));
    harness.window.setLoginRole('sm');
    assert.deepEqual(harness.calls.screens, []);
    assert.deepEqual(harness.calls.originalLoginRoles, ['staff']);
    assert.match(harness.elements['login-err'].textContent, /Switch to Owner or Store Manager/);
  }
});

test('Stock and DSR revoke an open manager workspace after a shell downgrade', () => {
  const stock = moduleHarness('stock', accessContext({ role: 'Store Manager' }));
  stock.window.setMode('sm');
  stock.update(accessContext({ role: 'Cashier' }));
  assert.equal(stock.window.st.mode, 'cro');
  assert.deepEqual(stock.calls.commits, ['sm', 'cro']);

  const dsr = moduleHarness('dsr', accessContext({ owner: true, role: 'Cashier' }));
  dsr.window.setLoginRole('sm');
  dsr.update(accessContext({ role: 'CRO' }));
  assert.equal(dsr.calls.logouts, 1);
  assert.equal(dsr.window.st.screen, 'staff');
});

test('Service and Expense refresh Owner controls when shell Owner context changes', () => {
  for (const moduleId of ['service', 'expense']) {
    const harness = moduleHarness(moduleId, accessContext({ role: 'Cashier' }));
    const renderKey = moduleId === 'service' ? 'renderDash' : 'render';
    assert.equal(harness.calls[renderKey], 1, `${moduleId} initial context render`);
    assert.equal(harness.window.isSuperAdmin(), false);

    harness.update(accessContext({ role: 'Cashier' }));
    assert.equal(harness.calls[renderKey], 1, `${moduleId} unchanged context must not rerender`);

    harness.update(accessContext({ owner: true, role: 'Cashier' }));
    assert.equal(harness.calls[renderKey], 2, `${moduleId} Owner activation render`);
    assert.equal(harness.window.isSuperAdmin(), true);

    harness.update(accessContext({ role: 'Cashier' }));
    assert.equal(harness.calls[renderKey], 3, `${moduleId} Owner revocation render`);
    assert.equal(harness.window.isSuperAdmin(), false);
  }
});

test('raw Stock and DSR bundles contain no literal Gold password fallback', () => {
  const literalGoldPassword = /(?:\b(?:pw|password)\b\s*={2,3}\s*["']Gold["']|["']Gold["']\s*={2,3}\s*\b(?:pw|password)\b)/i;
  const offenders = ['stock', 'dsr'].filter(moduleId =>
    literalGoldPassword.test(decodedModule(moduleId))
  );
  assert.deepEqual(
    offenders,
    [],
    `re-encode embedded module sources; literal fallback remains in: ${offenders.join(', ')}`
  );
});
