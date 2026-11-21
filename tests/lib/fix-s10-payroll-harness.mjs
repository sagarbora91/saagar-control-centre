// Test harness for the Payroll module (group S10-payroll). Runs the module's real inline script in a node:vm
// sandbox with a tiny fake DOM, a memory localStorage and a fake shell (reauth, confirm). No browser.
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const WWW = process.env.WWW_DIR || fileURLToPath(new URL('../../www/', import.meta.url));
export const PAYROLL_HTML = process.env.PAYROLL_HTML_PATH || WWW + 'modules/payroll/index.html';
export const SHELL_INDEX = WWW + 'index.html';
const wwwShared = file => WWW + 'shared/' + file;

function inlineScripts(html) {
  const out = [];
  for (const m of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(m[1])) continue;
    const type = (m[1].match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    if (type && !/(?:java|ecma)script|module/.test(type)) continue;
    out.push(m[2]);
  }
  return out;
}

function memoryStorage(initial = {}) {
  const v = new Map(Object.entries(initial).map(([k, x]) => [k, typeof x === 'string' ? x : JSON.stringify(x)]));
  const api = {
    getItem: k => (v.has(String(k)) ? v.get(String(k)) : null),
    setItem: (k, x) => { if (api.failWrite && api.failWrite(String(k))) throw new Error('quota'); v.set(String(k), String(x)); },
    removeItem: k => { v.delete(String(k)); },
    clear: () => v.clear(),
    key: i => [...v.keys()][i] ?? null,
    get length() { return v.size; },
    failWrite: null,
    _map: v
  };
  return api;
}

export function createPayroll({ storage = {}, reauth = true, confirms = true, readOnly = false, files = {} } = {}) {
  const html = fs.readFileSync(PAYROLL_HTML, 'utf8');
  const main = inlineScripts(html).find(s => s.includes('function calcGM'));
  const appData = html.match(/<script id="app-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
  const log = { confirms: [], reauth: [], html: [], saved: [], files: [] };
  const nodes = new Map();
  const makeEl = id => {
    let inner = '';
    return {
      id, value: '', textContent: '', checked: false, disabled: false, style: {}, dataset: {}, className: '', options: [],
      get innerHTML() { return inner; },
      set innerHTML(x) { inner = String(x); log.html.push({ id, html: inner }); },
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      appendChild() {}, remove() {}, setAttribute() {}, getAttribute() { return ''; }, addEventListener() {}, focus() {}, select() {},
      querySelector() { return null; }, querySelectorAll() { return []; }, scrollIntoView() {}
    };
  };
  const el = id => { id = String(id); if (!nodes.has(id)) nodes.set(id, makeEl(id)); return nodes.get(id); };
  const ls = memoryStorage(storage);
  const document = {
    readyState: 'loading', body: makeEl('body'), documentElement: Object.assign(makeEl('html'), { cloneNode() { return { querySelector: () => el('__clone_app_data'), outerHTML: '<html></html>' }; } }),
    addEventListener() {}, removeEventListener() {}, createElement() { return makeEl('new'); },
    getElementById(id) { return String(id) === 'app-data' ? { textContent: appData } : el(id); },
    querySelector() { return null; }, querySelectorAll() { return []; }
  };
  class FakeReader { readAsText(f) { this.result = f.text; setTimeout(() => this.onload && this.onload(), 0); } }
  const sb = {
    localStorage: ls, document, navigator: {}, location: { href: 'https://offline.invalid/' },
    Blob, Date, Math, JSON, Number, String, Boolean, Array, Object, Map, Set, Promise, RegExp, Error, parseFloat, parseInt, isNaN, Infinity,
    setTimeout, clearTimeout, console: { log() {}, warn() {}, error() {}, info() {} }, __saved: log.saved,
    confirm: m => { log.confirms.push(String(m)); return typeof confirms === 'function' ? confirms(String(m), log.confirms.length) : confirms; },
    alert() {}, prompt() { return ''; }, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    FileReader: FakeReader, URL: { createObjectURL() { return 'blob:x'; }, revokeObjectURL() {} },
    SaagarReauth: async label => { log.reauth.push(String(label)); return typeof reauth === 'function' ? reauth(label) : reauth; }
  };
  sb.window = sb; sb.parent = sb; sb.globalThis = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(fs.readFileSync(wwwShared('module-bridge.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(wwwShared('module-runtime.js'), 'utf8'), ctx);
  vm.runInContext(main, ctx, { filename: 'payroll.inline.js' });
  vm.runInContext(`ST_READ_ONLY=${readOnly ? 'true' : 'false'};`, ctx);
  // capture exports/saves without a shell
  vm.runInContext('appSaveBlob=function(blob,name,meta){__saved.push({blob:blob,name:name,meta:meta});return Promise.resolve();};', ctx);
  const run = code => vm.runInContext(code, ctx);
  const toastText = () => nodes.get('app-toast')?.textContent || '';
  return { ctx, run, log, nodes, el, ls, toastText, html };
}

// Standard employee row + state builder (November 2026, 30 days, no holidays).
export function row(over = {}) {
  return { id: 1, firm: 'GM', empId: 'GM001', name: 'Asha', gross: 20000, salaryType: 'S', gender: 'M', pfApplicable: true, esicApplicable: true,
    absent: 0, halfDay: 0, late: 0, noThumb: 0, leavesApplied: 0, advance: 0, accountNo: '5010100000000', ifsc: 'HDFC0001000', bankName: 'ICICI', ...over };
}
export function loadState(p, over = {}) {
  const s = { meta: { month: 'November', year: 2026, holidays: 0, totalDaysOverride: '' }, rows: [row()], advances: [], runs: {}, nextId: 10, ...over };
  p.run(`state=normalizeState(${JSON.stringify(s)});gmCalcCache=[];`);
}
