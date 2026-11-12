// Test harness for the S07 Expense fixes. New helper (not a test file). It loads the real Expense module script
// into a vm sandbox, with a mutable fake app shell so the real role code (shellCtx/role/can) is exercised.
// S07_MODULE_FILE may point at another copy of the module (used to prove a test fails against the pre-fix file).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { inlineModuleScripts } from './module-bundle.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const MODULE_FILE = process.env.S07_MODULE_FILE || path.join(rootDir, 'www/modules/expense/index.html');
export const moduleText = () => fs.readFileSync(MODULE_FILE, 'utf8');

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  return {
    getItem: (k) => (values.has(String(k)) ? values.get(String(k)) : null),
    setItem: (k, v) => { values.set(String(k), String(v)); },
    removeItem: (k) => { values.delete(String(k)); },
    clear: () => values.clear(),
    key: (i) => [...values.keys()][i] ?? null,
    get length() { return values.size; }
  };
}

function elementStub(overrides = {}) {
  return {
    value: '', textContent: '', innerHTML: '', checked: false, disabled: false, style: {}, dataset: {}, className: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, remove() {}, setAttribute() {}, getAttribute() { return ''; }, addEventListener() {}, focus() {}, select() {},
    ...overrides
  };
}

/**
 * shell: null (no parent shell at all) or a MUTABLE object {isOwner, role, isManager}; tests may change it mid-test.
 * reauth: boolean or a function returning a boolean (the Owner PIN keypad result).
 */
export function loadExpense({ storage = {}, elements = {}, shell = null, reauth = true, confirmResult = true } = {}) {
  const localStorage = memoryStorage(storage);
  const nodes = new Map();
  const node = (id) => {
    id = String(id);
    if (!nodes.has(id)) nodes.set(id, elementStub());
    return nodes.get(id);
  };
  Object.entries(elements).forEach(([id, value]) => { Object.assign(node(id), typeof value === 'object' ? value : { value }); });
  const document = {
    readyState: 'loading', body: elementStub(), documentElement: elementStub(),
    addEventListener() {}, removeEventListener() {}, createElement() { return elementStub(); },
    getElementById: (id) => node(id), querySelector() { return null; }, querySelectorAll() { return []; }
  };
  const confirms = [];
  const sandbox = {
    localStorage, document, navigator: {}, location: { href: 'https://offline.invalid/' },
    Blob, Date, Math, JSON, Number, String, Boolean, Array, Object, Map, Set, Promise, RegExp, TextEncoder, TextDecoder,
    URL: { createObjectURL() { return 'blob:offline'; }, revokeObjectURL() {} },
    atob: (v) => Buffer.from(v, 'base64').toString('binary'), btoa: (v) => Buffer.from(v, 'binary').toString('base64'),
    alert() {}, confirm(message) { confirms.push(String(message)); return typeof confirmResult === 'function' ? confirmResult(message) : confirmResult; },
    prompt() { return ''; },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    setTimeout, clearTimeout, setInterval, clearInterval
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const reauthCalls = [];
  if (shell) {
    sandbox.parent = {
      SaagarOwnerSession: {
        read: () => ({ version: 1, isOwner: shell.isOwner === true, isManager: shell.isManager === true, role: shell.role || '' }),
        isOwnerActive: () => shell.isOwner === true,
        currentRole: () => shell.role
      },
      SaagarReauth: async (label) => { reauthCalls.push(String(label)); return typeof reauth === 'function' ? reauth(label) : reauth; },
      postMessage() {}
    };
  } else {
    sandbox.parent = sandbox;
  }
  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(rootDir, 'www/shared/module-bridge.js'), 'utf8'), context, { filename: 'shared/module-bridge.js' });
  vm.runInContext(fs.readFileSync(path.join(rootDir, 'www/shared/module-runtime.js'), 'utf8'), context, { filename: 'shared/module-runtime.js' });
  const source = inlineModuleScripts(moduleText()).find((s) => s.includes('function computeDay'));
  if (!source) throw new Error('expense script not found');
  vm.runInContext(source, context, { filename: 'expense.embedded.html' });
  const run = (code) => vm.runInContext(code, context);
  return {
    context, run, storage: localStorage, nodes, node, confirms, reauthCalls,
    set: (id, value) => { node(id).value = value; },
    get: (id) => node(id),
    toastText: () => String(node('toast').textContent),
    modalHtml: () => String(node('modalRoot').innerHTML),
    today: () => run('todayStr()'),
    closeDay: (date) => {
      const st = JSON.parse(localStorage.getItem('tanishq_statements') || '{}');
      st[date] = { date, closed: true, physDeno: {}, bankDeno: {} };
      localStorage.setItem('tanishq_statements', JSON.stringify(st));
    },
    ledger: () => JSON.parse(localStorage.getItem('gm_expenses') || '[]'),
    json: (key, fallback = null) => { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); },
    tick: (ms = 5) => new Promise((r) => setTimeout(r, ms))
  };
}
