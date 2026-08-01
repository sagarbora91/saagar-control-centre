import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const index = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');

function modules() {
  const match = index.match(/\bconst\s+MODULES\s*=\s*(\[[\s\S]*?\])\s*;/);
  assert.ok(match, 'expected embedded module registry');
  return JSON.parse(match[1]);
}

function decoded(id) {
  const module = modules().find(value => value.id === id);
  assert.ok(module, `expected ${id} module`);
  return Buffer.from(module.html_b64, 'base64').toString('utf8');
}

function extractFunction(source, name) {
  const match = new RegExp(`function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `expected ${name}`);
  const open = source.indexOf('{', match.index + match[0].length);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let position = open; position < source.length; position += 1) {
    const character = source[position];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}' && --depth === 0) return source.slice(match.index, position + 1);
  }
  assert.fail(`unterminated ${name}`);
}

function runHandler(isOwner) {
  const source = extractFunction(decoded('service'), 'setWatchPhotoMandatory');
  const context = vm.createContext({
    isOwner,
    result: null,
    saves: 0,
    renders: 0,
    toasts: [],
    setting: null
  });
  vm.runInContext(`
    var SVC_SETTINGS = { watchPhotoMandatory: false };
    function isSuperAdmin(){ return isOwner === true; }
    function saveSvcSettings(){ saves += 1; }
    function renderDash(){ renders += 1; }
    function toast(message){ toasts.push(String(message)); }
    ${source}
    result = setWatchPhotoMandatory(true);
    setting = SVC_SETTINGS.watchPhotoMandatory;
  `, context, { filename: 'service-owner-setting-guard.js' });
  return context;
}

test('raw Service and Expense Owner checks use only the read-only shell bridge', () => {
  for (const id of ['service', 'expense']) {
    const source = extractFunction(decoded(id), 'isSuperAdmin');
    assert.match(source, /SaagarOwnerSession/);
    assert.match(source, /isOwnerActive\s*\(/);
    assert.doesNotMatch(source, /localStorage|st_v2_admin_mode|ADMIN_MODE_KEY/);
  }
});

test('Service watch-photo policy denies stale or programmatic non-Owner changes', () => {
  const denied = runHandler(false);
  assert.equal(denied.result, false);
  assert.equal(denied.setting, false);
  assert.equal(denied.saves, 0);
  assert.equal(denied.renders, 1);
  assert.match(denied.toasts.join(' '), /Owner access/i);

  const allowed = runHandler(true);
  assert.equal(allowed.result, true);
  assert.equal(allowed.setting, true);
  assert.equal(allowed.saves, 1);
  assert.equal(allowed.renders, 0);
});

