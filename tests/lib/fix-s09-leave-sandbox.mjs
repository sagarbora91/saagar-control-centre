// Shared sandbox for the S09 Leave fix tests. Loads the Leave module script in a vm context with
// small DOM stubs, an in-memory localStorage and a fake parent shell (session, postMessage).
// Set FIX_S09_LEAVE_FILE to point at another copy of the module (used to prove a test fails before the fix).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { inlineModuleScripts } from './module-bundle.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LEAVE_FILE = process.env.FIX_S09_LEAVE_FILE || path.join(rootDir, 'www/modules/leave/index.html');

export function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  return {
    getItem(k) { return values.has(String(k)) ? values.get(String(k)) : null; },
    setItem(k, v) { values.set(String(k), String(v)); },
    removeItem(k) { values.delete(String(k)); },
    clear() { values.clear(); },
    key(i) { return [...values.keys()][i] ?? null; },
    get length() { return values.size; }
  };
}

function makeElement(overrides = {}) {
  const classes = new Set();
  let html = '';
  const el = {
    value: '', textContent: '', checked: false, disabled: false, style: {}, dataset: {}, className: '',
    children: [], tagName: 'DIV', onclick: null,
    classList: {
      add(c) { classes.add(c); }, remove(c) { classes.delete(c); },
      toggle(c, on) { if (on === undefined ? !classes.has(c) : on) classes.add(c); else classes.delete(c); },
      contains(c) { return classes.has(c); }
    },
    get innerHTML() { return html; },
    set innerHTML(v) { html = String(v); el.children = []; },
    appendChild(c) { el.children.push(c); return c; },
    replaceChild() {}, remove() {}, setAttribute() {}, getAttribute() { return ''; },
    addEventListener() {}, focus() {}, select() {}
  };
  return Object.assign(el, overrides);
}

export function todayLocal() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// session: object for the fake shell session, or null/undefined for "no parent shell".
export function loadLeave({ storage = {}, elements = {}, session, parentExtras = {}, confirmAnswers = [] } = {}) {
  const messages = [], confirms = [], toasts = [], created = [];
  const localStorage = memoryStorage(storage);
  const nodes = new Map();
  const getNode = id => {
    id = String(id);
    if (!nodes.has(id)) nodes.set(id, makeElement());
    return nodes.get(id);
  };
  Object.entries(elements).forEach(([id, v]) => {
    const n = getNode(id);
    if (v && typeof v === 'object') Object.assign(n, v); else n.value = v;
  });
  const document = {
    readyState: 'loading', body: makeElement(), documentElement: makeElement(),
    addEventListener() {}, removeEventListener() {},
    createElement(tag) { const e = makeElement({ tagName: String(tag).toUpperCase() }); created.push(e); return e; },
    createTextNode(t) { return { text: String(t) }; },
    getElementById: getNode,
    querySelector() { return null; }, querySelectorAll() { return []; }
  };
  const answers = confirmAnswers.slice();
  const sandbox = {
    localStorage, document, navigator: {}, location: { href: 'https://offline.invalid/' },
    Blob, Date, Math, JSON, Number, String, Boolean, Array, Object, Map, Set, Promise, RegExp, Error,
    TextEncoder, TextDecoder, Buffer,
    URL: { createObjectURL() { return 'blob:offline'; }, revokeObjectURL() {} },
    atob: v => Buffer.from(v, 'base64').toString('binary'),
    btoa: v => Buffer.from(v, 'binary').toString('base64'),
    alert() {}, prompt() { return ''; },
    confirm(msg) { confirms.push(String(msg)); return answers.length ? answers.shift() : true; },
    FileReader: class { readAsText(file) { this.onload({ target: { result: file.text } }); } },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    setTimeout() { return 0; }, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {}
  };
  sandbox.SaagarRenderedComponents = { encodeArgs: a => JSON.stringify(a), observe() {}, connect() {} };
  sandbox.LeaveRenderedPolicy = {};
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  if (session) {
    sandbox.parent = Object.assign({
      SaagarOwnerSession: { read: () => session },
      postMessage: (m) => { messages.push(m); }
    }, parentExtras);
  } else {
    sandbox.parent = sandbox;
  }
  sandbox.__stAsOf = todayLocal();
  const ctx = vm.createContext(sandbox);
  const run = code => vm.runInContext(code, ctx);

  const html = fs.readFileSync(LEAVE_FILE, 'utf8');
  const source = inlineModuleScripts(html).find(s => s.includes('function fyUsage'));
  if (!source) throw new Error('Leave module script not found');
  for (const lib of ['shared/module-bridge.js', 'shared/module-runtime.js']) {
    vm.runInContext(fs.readFileSync(path.join(rootDir, 'www', lib), 'utf8'), ctx, { filename: lib });
  }
  vm.runInContext(source, ctx, { filename: 'leave.embedded.html' });
  // The DOM stub has no real toast container; record toasts and keep the original out of the way.
  ctx.showToast = (msg, type) => { toasts.push({ msg: String(msg), type: type || 'info' }); };
  return { ctx, run, toasts, confirms, messages, nodes, created, getNode, storage: localStorage, html };
}

export const OWNER = { version: 1, isOwner: true, role: 'Owner', isManager: true };
export const MANAGER = { version: 1, isOwner: false, role: 'Store Manager', isManager: true };
export const CASHIER = { version: 1, isOwner: false, role: 'Cashier', isManager: false };

// A future date base so isPastView() is false while viewing today.
export function seedData(extra = {}) {
  return Object.assign({
    leaves: {},
    agendas: {},
    employees: [
      { id: 'e1', name: 'Karan Mehta', empId: 'E1', department: 'Sales' },
      { id: 'e2', name: 'Asha Rao', empId: 'E2', department: 'Sales' }
    ]
  }, extra);
}
