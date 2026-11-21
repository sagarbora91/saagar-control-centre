// tests/lib/svc1-store-shell.mjs
// Runs the REAL backup, restore and reset functions of www/index.html in a vm sandbox with a fake localStorage.
// Nothing in the shell is edited or re-implemented: functions are cut out of the shell text by brace matching.
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { shell, fn, between } from './fix-s01-extract.mjs';

export { shell, fn, between };
export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const INDEX_PATH = `${ROOT}/www/index.html`;
export const AUTO_BACKUP_SRC = fs.readFileSync(`${ROOT}/www/auto-backup.js`, 'utf8');

// Every top-level single-line string constant of the shell (ADMIN_PIN_KEY and friends).
function stringConsts() {
  const out = [];
  const seen = new Set();
  const re = /^const ([A-Z][A-Z0-9_]*)\s*=\s*("[^"\n]*"|'[^'\n]*')\s*;/gm;
  let m;
  while ((m = re.exec(shell))) { if (!seen.has(m[1])) { seen.add(m[1]); out.push(`const ${m[1]} = ${m[2]};`); } }
  return out.join('\n');
}

export function storageRulesSource() {
  const start = shell.indexOf('const STORAGE_RULES = {');
  const end = shell.indexOf('\n};', start) + 3;
  return shell.slice(start, end);
}

export function fakeLocalStorage(data) {
  const m = data || new Map();
  return {
    data: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; }
  };
}

// Returns a context holding the real shell functions. `data` is the Map behind localStorage.
export function shellBox(data, extraGlobals = {}) {
  const ls = fakeLocalStorage(data);
  const ctx = vm.createContext(Object.assign({ console, localStorage: ls }, extraGlobals));
  ctx.window = ctx;
  const calls = { toasts: [], alerts: [], audit: [] };
  ctx.toast = (m) => { calls.toasts.push(m); };
  ctx.alert = (m) => { calls.alerts.push(m); };
  ctx.confirm = () => true;
  ctx.auditLog = (a, b) => { calls.audit.push([a, b]); };
  ctx.renderConfigBackup = () => {};
  ctx.isAdmin = true;
  ctx.unlockAdmin = () => {};
  ctx.$ = () => ({ value: 'service' });
  const pre = [
    stringConsts(),
    storageRulesSource(),
    "const MODULES = Object.keys(STORAGE_RULES).map(function(id){ return { id: id, title: id === 'service' ? 'Service' : id, file: id + '.html' }; });",
    "const APP_VERSION = 'test'; const APK_BUILD = 'test';"
  ];
  for (const s of pre) vm.runInContext(s, ctx);
  const names = [
    'tryJSON', 'safeGet', 'safeSet', 'safeRemove', 'allStorage', 'backupStorageStrict', 'restoreBlockedKeys', 'appControlKeys',
    'keyMatchesModule', 'isWhitelistedAppKey', 'ownerModuleForKey', 'keysForModule', 'moduleById', 'restoreKeyOwnerId', 'parsedRestoreValue',
    'validateRestoreKeyValue', 'validateRestoreData', 'restoreStorageValues', 'verifyStorageValues', 'backupPayload',
    'resetSelectedModule', 'undoLastModuleReset'
  ];
  for (const n of names) vm.runInContext(fn(n), ctx);
  return { ctx, ls, calls, run: (src) => vm.runInContext(src, ctx) };
}

// A fake SaagarStore.bulk, as the shell uses it during restore.
export function installBulk(box, { failKey = null } = {}) {
  let bulkCalls = 0;
  box.ctx.SaagarStore = {
    enabled: true,
    bulk(write) { bulkCalls += 1; write(); return true; }
  };
  if (failKey) {
    const real = box.ls.setItem;
    box.ls.setItem = (k, v) => { if (k === failKey) throw new Error('quota'); real(k, v); };
  }
  return { get bulkCalls() { return bulkCalls; } };
}

// auto-backup.js is a closed script: its snapshot() is cut out and run with the constants it needs.
export function autoBackupSnapshot(data) {
  const ls = fakeLocalStorage(data);
  const ctx = vm.createContext({ console, localStorage: ls });
  vm.runInContext("var LOG_KEY = 'bcc_autobackup_log'; var WARNING_KEY = 'bcc_autobackup_warning'; var SECRET_KEYS = { 'st_v2_admin_pin_hash': 1, 'st_v2_admin_mode': 1, 'saagar_staff_pins_v1': 1 }; function nowIso(){ return '2026-11-13T00:00:00.000Z'; }", ctx);
  vm.runInContext(fn('snapshot', AUTO_BACKUP_SRC), ctx);
  return vm.runInContext('snapshot()', ctx);
}
