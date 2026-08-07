import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadModuleBundle } from './lib/module-bundle.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const index = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
const policySource = fs.readFileSync(path.join(root, 'www/module-pin-policy.js'), 'utf8');
const policy = require('../www/module-pin-policy.js');
const moduleBundle = loadModuleBundle();

const MODULE_IDS = [
  'stock',
  'service',
  'qms',
  'dsr',
  'expense',
  'grooming',
  'cro_audit',
  'payroll',
  'leave',
  'tax',
  'planning'
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* Extract a named function without depending on formatting. The shell contains
   large template literals, so a non-greedy regular expression is not enough. */
function extractFunction(name, source = index) {
  const startMatch = new RegExp(
    String.raw`(?:async\s+)?function\s+${escapeRegExp(name)}\s*\(`
  ).exec(source);
  assert.ok(startMatch, `expected function ${name}`);

  const start = startMatch.index;
  const open = source.indexOf('{', start + startMatch[0].length);
  assert.ok(open >= 0, `expected opening brace for ${name}`);

  let depth = 0;
  let state = 'code';
  let escaped = false;
  let regexClass = false;
  let previousSignificant = '';

  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (state === 'line-comment') {
      if (ch === '\n') state = 'code';
      continue;
    }
    if (state === 'block-comment') {
      if (ch === '*' && next === '/') {
        state = 'code';
        i += 1;
      }
      continue;
    }
    if (state === 'single' || state === 'double' || state === 'template') {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if ((state === 'single' && ch === "'") ||
          (state === 'double' && ch === '"') ||
          (state === 'template' && ch === '`')) {
        state = 'code';
      }
      continue;
    }
    if (state === 'regex') {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '[') regexClass = true;
      if (ch === ']') regexClass = false;
      if (ch === '/' && !regexClass) state = 'code';
      continue;
    }

    if (ch === '/' && next === '/') {
      state = 'line-comment';
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      state = 'block-comment';
      i += 1;
      continue;
    }
    if (ch === "'") {
      state = 'single';
      continue;
    }
    if (ch === '"') {
      state = 'double';
      continue;
    }
    if (ch === '`') {
      state = 'template';
      continue;
    }
    if (ch === '/' && /[=(:,!&|?;{}[\]]/.test(previousSignificant || '=')) {
      state = 'regex';
      regexClass = false;
      continue;
    }

    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
    if (!/\s/.test(ch)) previousSignificant = ch;
  }

  assert.fail(`unterminated function ${name}`);
}

function namedFunctions(source = index) {
  const names = [];
  const re = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let match;
  while ((match = re.exec(source))) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  return names.map(name => ({ name, source: extractFunction(name, source) }));
}

function functionContaining(pattern, source = index) {
  return namedFunctions(source).find(item => pattern.test(item.source));
}

function decodedModule(id) {
  const mod = moduleBundle.find(function (item) { return item.id === id; });
  assert.ok(mod, 'expected ' + id + ' module');
  return mod.html;
}

function calledInjectionNames() {
  const build = extractFunction('buildModuleSrc');
  return [...build.matchAll(/\b(inject[A-Z][A-Za-z0-9_$]*)\s*\(/g)]
    .map(match => match[1])
    .filter((name, position, all) => all.indexOf(name) === position);
}

function applyOwnerCompatibilityTransforms(html, moduleId) {
  const candidates = calledInjectionNames().map(name => ({
    name,
    source: extractFunction(name)
  })).filter(item =>
    /SaagarOwnerSession|SaagarAdminPinCheck|st_v2_admin_mode|["']Gold["']/.test(item.source)
  );

  assert.ok(
    candidates.length > 0,
    'buildModuleSrc must call an Owner/PIN compatibility transform'
  );

  let output = html;
  for (const candidate of candidates) {
    const context = vm.createContext({
      ADMIN_MODE_KEY: 'st_v2_admin_mode',
      JSON,
      String,
      escapeHtml: value => String(value),
      getUiMode: () => 'mobile',
      input: output,
      moduleId,
      result: null,
      __injBeforeBodyEnd(source, fragment) {
        const at = source.toLowerCase().lastIndexOf('</body>');
        return at >= 0
          ? source.slice(0, at) + fragment + '\n' + source.slice(at)
          : source + fragment;
      }
    });

    assert.doesNotThrow(() => {
      vm.runInContext(
        `${candidate.source}\nresult = ${candidate.name}(input, moduleId);`,
        context,
        { filename: `${candidate.name}.integration.js` }
      );
    }, `${candidate.name} must remain a deterministic source transform`);
    assert.equal(typeof context.result, 'string', `${candidate.name} must return HTML`);
    output = context.result;
  }
  return output;
}

test('module PIN policy loads before the main shell and defaults all modules off', () => {
  const policyAt = index.indexOf('<script src="module-pin-policy.js"></script>');
  const shellAt = index.indexOf('const MODULES =');

  assert.ok(policyAt >= 0, 'module-pin-policy.js must be loaded');
  assert.ok(shellAt > policyAt, 'module PIN policy must load before the main shell');
  assert.deepEqual(policy.MODULE_IDS, MODULE_IDS);
  assert.equal(policy.defaults().version, 1);
  assert.ok(Object.values(policy.defaults().modules).every(enabled => enabled === false));
});

test('Settings exposes Security & PINs and renders one switch for every module', () => {
  assert.match(
    index,
    /<button\b[^>]*data-sub=["']security["'][^>]*>[\s\S]*?Security\s*&amp;\s*PINs[\s\S]*?<\/button>/i
  );
  assert.match(index, /<div\b[^>]*id=["']subSecurity["'][^>]*>/i);

  const staticSwitches = [...index.matchAll(
    /<(?:input|button)\b[^>]*data-module-pin=["']([^"']+)["'][^>]*>/gi
  )];
  const staticIds = staticSwitches.map(match => match[1]);
  if (staticIds.length === MODULE_IDS.length && staticIds.every(id => MODULE_IDS.includes(id))) {
    assert.deepEqual(
      staticIds.sort(),
      [...MODULE_IDS].sort()
    );
    staticSwitches.forEach(match => {
      assert.match(match[0], /type=["']checkbox["']|role=["']switch["']/i);
    });
    return;
  }

  const renderer = functionContaining(/data-module-pin=/);
  assert.ok(renderer, 'expected a generated module-PIN switch renderer');
  assert.match(renderer.source, /type=[\\"']checkbox[\\"']|role=[\\"']switch[\\"']/i);
  assert.match(
    renderer.source,
    /SaagarModulePinPolicy\.MODULE_IDS|ACCESS_MODULES/,
    'renderer must iterate the canonical 11-module registry'
  );
});

test('shell policy integration uses the versioned policy and leaves the legacy global flag inert', () => {
  assert.match(index, /const\s+MODULE_PIN_POLICY_KEY\s*=\s*["'][^"']+["']/);
  const reader = namedFunctions().find(item =>
    /MODULE_PIN_POLICY_KEY/.test(item.source) &&
    /\.normalize\s*\(/.test(item.source)
  );
  assert.ok(reader, 'expected a policy reader backed by SaagarModulePinPolicy');
  assert.doesNotMatch(reader.source, /PROTECTED_MODULES_KEY|protectedModulesEnabled/);

  const access = extractFunction('ensureModuleAccess');
  const tile = extractFunction('moduleTileHTML');
  assert.doesNotMatch(access, /PROTECTED_MODULES_KEY|protectedModulesEnabled/);
  assert.doesNotMatch(tile, /PROTECTED_MODULES_KEY|protectedModulesEnabled/);
  assert.doesNotMatch(index, /safe(?:Get|Set)\(\s*PROTECTED_MODULES_KEY/);

  const legacyGetterCalls = index.match(/\bprotectedModulesEnabled\s*\(/g) || [];
  const legacyToggleCalls = index.match(/\btoggleProtectedModules\s*\(/g) || [];
  assert.ok(legacyGetterCalls.length <= 1, 'legacy getter must have no active callers');
  assert.ok(legacyToggleCalls.length <= 1, 'legacy toggle must have no active callers');
});

test('module entry uses one-use verify-only approval without elevating Owner mode', () => {
  const access = extractFunction('ensureModuleAccess');

  assert.match(
    access,
    /SaagarModulePinPolicy\.requiresPin|modulePin(?:Required|Enabled|Policy)/
  );
  assert.match(access, /promptVerifyOnly(?:Result)?\s*\(/);
  assert.doesNotMatch(access, /\bunlockAdmin\s*\(/);
  assert.doesNotMatch(access, /\bsetAdmin\s*\(/);
  assert.doesNotMatch(access, /\bisAdmin\s*=/);
});

test('Owner is selectable explicitly and is recomputed after authoritative storage is ready', () => {
  const roleSelect = index.match(/<select\b[^>]*id=["']roleSelect["'][^>]*>/i)?.[0] || '';
  const handlerName = roleSelect.match(
    /onchange=["']([A-Za-z_$][\w$]*)\(this\.value\)["']/
  )?.[1];
  assert.ok(handlerName, 'role selector must have a session-aware change handler');
  assert.notEqual(handlerName, 'setCurrentRole');

  const handler = extractFunction(handlerName);
  const mode = extractFunction('applyMode');
  assert.match(handler + mode, /__owner__|OWNER_(?:ROLE|SELECT)/);
  assert.match(handler + mode, /Owner/);
  assert.match(handler, /unlockAdmin\s*\(/);
  assert.match(handler, /setAdmin\s*\(\s*false\s*\)/);

  const firstRender = extractFunction('doFirstRender');
  const sessionRefresh = namedFunctions().find(item =>
    item.name !== 'doFirstRender' &&
    /\bisAdmin\s*=/.test(item.source) &&
    /safeGet\(\s*ADMIN_MODE_KEY\s*\)|adminToken\s*\(/.test(item.source) &&
    new RegExp(`\\b${escapeRegExp(item.name)}\\s*\\(`).test(firstRender)
  );
  const directRefresh = /\bisAdmin\s*=/.test(firstRender) &&
    /safeGet\(\s*ADMIN_MODE_KEY\s*\)|adminToken\s*\(/.test(firstRender);

  assert.ok(directRefresh || sessionRefresh, 'doFirstRender must recompute Owner state');
  const refreshAt = directRefresh
    ? firstRender.search(/\bisAdmin\s*=/)
    : firstRender.search(new RegExp(`\\b${escapeRegExp(sessionRefresh.name)}\\s*\\(`));
  const businessRenderAt = firstRender.search(/populateResetSelect\s*\(|switchView\s*\(/);
  assert.ok(refreshAt >= 0 && refreshAt < businessRenderAt, 'Owner state must refresh before business UI');
  assert.match(directRefresh ? firstRender : sessionRefresh.source, /applyMode\s*\(/);
  assert.match(index, /SaagarStore\.whenReady\s*\(\s*doFirstRender\s*\)/);
});

test('portable backup includes the new policy and restore validates its strict shape', () => {
  const appKeys = extractFunction('appControlKeys');
  const restore = extractFunction('validateRestoreKeyValue');
  assert.match(appKeys, /MODULE_PIN_POLICY_KEY/);
  assert.match(restore, /MODULE_PIN_POLICY_KEY/);

  const referencedPolicyHelpers = namedFunctions().filter(item =>
    /module.*pin|pin.*module/i.test(item.name) &&
    new RegExp(`\\b${escapeRegExp(item.name)}\\s*\\(`).test(restore)
  );
  const delegatesToPolicyValidator = /SaagarModulePinPolicy\.(?:isValid|validate)\s*\(/.test(restore);
  const validationScope = [
    restore,
    ...referencedPolicyHelpers.map(item => item.source),
    ...(delegatesToPolicyValidator ? [policySource] : [])
  ].join('\n');
  if (delegatesToPolicyValidator) {
    assert.match(policySource, /function\s+(?:isValid|validate)\s*\(/);
  }
  assert.match(validationScope, /version/i);
  assert.match(validationScope, /modules/i);
  assert.match(validationScope, /boolean|===\s*true|===\s*false/);
  assert.match(validationScope, /MODULE_IDS|ACCESS_MODULES|isKnownModule/);
});

test('embedded Owner bridge recognises token-backed Owner sessions', () => {
  const ownerBridgeAt = index.search(/window\.SaagarOwnerSession\s*=/);
  assert.ok(ownerBridgeAt >= 0, 'expected read-only SaagarOwnerSession bridge');
  const ownerBridge = index.slice(ownerBridgeAt, ownerBridgeAt + 2000);
  assert.match(ownerBridge, /isOwnerActive\s*[:=]/);
  assert.match(
    ownerBridge,
    /(?:currentRole|managerContext)\s*[:=]/
  );

  for (const moduleId of ['service', 'expense']) {
    const transformed = applyOwnerCompatibilityTransforms(decodedModule(moduleId), moduleId);
    assert.doesNotMatch(
      transformed,
      /localStorage\.getItem\(\s*["']st_v2_admin_mode["']\s*\)\s*===?\s*["']true["']/,
      `${moduleId} must not compare the token-backed Owner marker to literal true`
    );
    assert.match(
      transformed,
      /SaagarOwnerSession[\s\S]{0,300}isOwnerActive\s*\(/,
      `${moduleId} must use the read-only Owner-session bridge`
    );
  }
});

test('runtime Stock/DSR authentication has no literal Gold password fallback', () => {
  const pinBridgeAt = index.indexOf('window.SaagarAdminPinCheck = function');
  assert.ok(pinBridgeAt >= 0, 'expected shared module PIN verification bridge');
  const pinBridgeTail = index.slice(pinBridgeAt, pinBridgeAt + 1800);
  assert.doesNotMatch(pinBridgeTail, /["']Gold["']/);

  const literalGoldPassword = /(?:\b(?:pw|password)\b\s*={2,3}\s*["']Gold["']|["']Gold["']\s*={2,3}\s*\b(?:pw|password)\b)/i;
  for (const moduleId of ['stock', 'dsr']) {
    const transformed = applyOwnerCompatibilityTransforms(decodedModule(moduleId), moduleId);
    assert.doesNotMatch(
      transformed,
      literalGoldPassword,
      `${moduleId} must not retain a hard-coded Gold credential`
    );
    assert.match(
      transformed,
      /SaagarAdminPinCheck|SaagarOwnerSession/,
      `${moduleId} must use a shell-owned authentication bridge`
    );
  }
});
