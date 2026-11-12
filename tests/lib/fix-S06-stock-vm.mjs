// Shared vm harness for the S06 Stock fix tests.
// Loads the big inline script of www/modules/stock/index.html (everything before
// "(function init() {") into a vm context with in-memory stubs.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const STOCK_FILE = path.resolve(here, '..', '..', 'www', 'modules', 'stock', 'index.html');
export const stockSource = () => fs.readFileSync(STOCK_FILE, 'utf8');

const EXPORTS = [
  'st', 'getBrands', 'getOwnBrands', 'getHiddenBrands', 'importJSON', 'addBrand', 'removeBrand', 'brandDrop',
  'resetBrandsToDefault', 'updOpen', 'updMov', 'updClose', 'clearAll', 'delConfirmSubmit', 'clearDay',
  'stockOversize', 'negativeBalanceBrands', 'writeClearLog', 'lastClear', 'loadData', 'saveData', 'closingSys',
  'printOpeningReg', 'renderSettings', 'dataKey',
];

export function inlineScript(src = stockSource()) {
  const blocks = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const big = blocks.find(b => b.includes('const DEFAULT_BRANDS'));
  if (!big) throw new Error('stock inline script not found');
  const cut = big.indexOf('(function init() {');
  if (cut < 0) throw new Error('init marker not found');
  return big.slice(0, cut);
}

export function makeCtx(opts = {}) {
  const log = [];                       // ordered event log: 'reauth:<label>', 'remove:<key>', 'set:<key>'
  const mem = new Map(Object.entries(opts.storage || {}));
  const localStorage = {
    get length() { return mem.size; },
    key: i => [...mem.keys()][i] ?? null,
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { if (opts.failSet && opts.failSet(k)) throw new Error('quota'); log.push('set:' + k); mem.set(k, String(v)); },
    removeItem: k => { log.push('remove:' + k); mem.delete(k); },
  };
  const toasts = [];
  const els = {};
  const mkEl = id => {
    const el = {
      id, style: {}, value: '', innerHTML: '', textContent: '', disabled: false, files: [],
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      children: [],
      appendChild(c) { this.children.push(c); if (id === 'toasts') toasts.push({ text: c.textContent, cls: c.className }); return c; },
      remove() {}, addEventListener() {}, removeEventListener() {}, focus() {}, setAttribute() {}, getAttribute: () => null,
      querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    };
    return el;
  };
  const document = {
    getElementById: id => (els[id] || (els[id] = mkEl(id))),
    createElement: () => mkEl(null),
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, body: mkEl('body'), documentElement: mkEl('html'),
  };
  const reauth = { answer: opts.reauth ?? true, labels: [] };
  const pending = [];                   // FileReader completions to await
  class FileReader {
    readAsText(file) {
      const p = Promise.resolve().then(() => this.onload && this.onload({ target: { result: file.text } }));
      pending.push(p);
    }
  }
  const win = { parent: null, addEventListener() {}, removeEventListener() {} };
  win.parent = win;
  const sandbox = {
    localStorage, document, window: win, navigator: { userAgent: 'node' }, console,
    confirm: () => (opts.confirm ?? true), alert() {}, FileReader,
    setTimeout: fn => { try { fn(); } catch (e) {} return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    SaagarModuleBridge: {},
    SaagarModuleRuntime: {
      reauth: async label => { reauth.labels.push(label); log.push('reauth:' + label); return reauth.answer; },
    },
    Blob: class { constructor(p) { this.parts = p; } }, URL: { createObjectURL: () => '', revokeObjectURL() {} },
    Date, JSON, Math, Object, Array, String, Number, Promise, Map, Set, RegExp, Error,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const code = inlineScript(opts.source) + '\n;({ ' + EXPORTS.map(n => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(', ') + ' });';
  const api = vm.runInContext(code, sandbox, { filename: 'stock-inline.js' });
  const toastText = () => toasts.map(t => t.text);
  const lastToast = () => (toasts.length ? toasts[toasts.length - 1] : null);
  const flush = async () => { for (let i = 0; i < 5; i++) { await Promise.all(pending.splice(0)); await new Promise(r => setImmediate(r)); } };
  const pickFile = async (text, input = { value: 'x', files: null }) => {
    input.files = [{ text }];
    api.importJSON(input);
    await flush();
    return input;
  };
  const run = code => vm.runInContext(code, sandbox);
  return { api, run, mem, log, toasts, toastText, lastToast, reauth, els, localStorage, win, flush, pickFile, sandbox };
}

// A small day record builder for CLASSIC (titanworld default brand list contains CLASSIC).
export function dayRecord(over = {}) {
  return Object.assign({
    _v: 2,
    opening: { CLASSIC: { display: 3, storage: 2, defective: 0, yLoc: 0, systemStock: 10, remarks: '', croName: 'A', time: '', verified: false, countDone: true } },
    movements: { CLASSIC: { inward: 0, outward: 0, sales: 1, grn: 0, theft: 0, theftRemark: '' } },
    closing: { CLASSIC: { display: 0, storage: 0, defective: 0, yLoc: 0, remarks: '', croName: '', time: '', verified: false, countDone: false } },
    openingLocked: false, closingLocked: false, movementsSubmitted: false,
  }, over);
}
