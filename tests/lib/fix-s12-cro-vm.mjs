// Fix wave S12 helper: runs the real inline scripts of the CRO audit and Planning modules
// in node:vm against small stubs. No copy of the module logic lives here.
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
// FIX_S12_CRO_FILE / FIX_S12_PLN_FILE let a reviewer point the tests at the pre-fix file to see them fail.
export const CRO_PATH = process.env.FIX_S12_CRO_FILE || root + 'www/modules/cro_audit/index.html';
export const PLN_PATH = process.env.FIX_S12_PLN_FILE || root + 'www/modules/planning/index.html';
export const croHtml = () => fs.readFileSync(CRO_PATH, 'utf8');
export const plnHtml = () => fs.readFileSync(PLN_PATH, 'utf8');

const NUMBER_BOXES = ['nps-bills', 'nps-coll', 'nps-score-inp', 'rev-cnt', 'mktg-cnt', 'groom-pct'];

function inlineScript(html, marker) {
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) if (m[1].includes(marker)) return m[1];
  throw new Error('inline script not found: ' + marker);
}

function makeDocument() {
  const els = new Map();
  const doc = {
    els,
    body: null,
    readyState: 'loading',
    getElementById(id) {
      if (!els.has(id)) els.set(id, makeEl(id, doc));
      return els.get(id);
    },
    createElement(tag) { return makeEl('new-' + tag, doc); },
    querySelector() { return makeEl('q', doc); },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
    getElementsByClassName() { return []; }
  };
  doc.body = makeEl('body', doc);
  return doc;
}

function makeEl(id, doc) {
  const el = {
    id, value: '', textContent: '', _html: '', style: {}, dataset: {}, className: '',
    checked: false, disabled: false, readOnly: false, hidden: false, attrs: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    hasAttribute(k) { return k in this.attrs; },
    appendChild(c) { return c; }, insertBefore(c) { return c; }, remove() {},
    scrollIntoView() {}, focus() {}, addEventListener() {}, removeEventListener() {},
    querySelector() { return makeEl('q', doc); },
    querySelectorAll() { return []; },
    closest() { return makeEl('c', doc); },
    getBoundingClientRect() { return {}; },
    get parentNode() { return makeEl('p', doc); }
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._html; },
    set(v) {
      this._html = String(v);
      // buildTasks() re-creates the task cards: the number boxes come back blank.
      if (this.id === 'tasks-area') NUMBER_BOXES.forEach(b => { doc.getElementById(b).value = ''; });
    }
  });
  return el;
}

function makeStorage(seed) {
  const m = new Map(Object.entries(seed || {}).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  return {
    map: m,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: k => { m.delete(k); },
    key: i => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; }
  };
}

function baseContext(storage, extra = {}) {
  const doc = makeDocument();
  const posts = [];
  const listeners = [];
  const ctx = {
    document: doc, localStorage: storage, console,
    setTimeout, clearTimeout, Date, JSON, Math, Number, String, Array, Object, Promise, isFinite, parseInt, parseFloat,
    confirm: () => true, alert() {}, requestAnimationFrame: f => setTimeout(f, 0),
    SaagarRenderedComponents: { createPolicy: p => p, connect() {}, observe() {}, encodeArgs: a => JSON.stringify(a) },
    SaagarModuleBridge: {},
    SaagarModuleRuntime: Object.assign({ targetOrigin: '*', accepts: () => true, run() {} }, extra.runtime || {}),
    SaagarUiFoundation: { configure() {} },
    CroAuditRenderedPolicy: {},
    MutationObserver: class { observe() {} disconnect() {} },
    navigator: { userAgent: 'node' }
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.parent = { postMessage: (msg, origin) => posts.push({ msg, origin }) };
  ctx.addEventListener = (type, fn) => listeners.push({ type, fn });
  ctx.scrollTo = () => {};
  ctx.getComputedStyle = () => ({});
  ctx.posts = posts;
  ctx.listeners = listeners;
  return ctx;
}

export function loadCro({ storage = {}, asOf, runtime } = {}) {
  const html = croHtml();
  const ls = makeStorage(storage);
  const ctx = baseContext(ls, { runtime });
  const toasts = [];
  if (asOf) ctx.__stAsOf = asOf;
  vm.createContext(ctx);
  vm.runInContext(inlineScript(html, 'const DEF ='), ctx, { filename: 'cro_audit.inline.js' });
  // record toasts without touching the module logic
  ctx.showToast = m => { toasts.push(String(m)); };
  const api = {
    ctx, ls, toasts, doc: ctx.document, posts: ctx.posts,
    el: id => ctx.document.getElementById(id),
    run: code => vm.runInContext(code, ctx),
    audits: () => JSON.parse(ls.getItem('cro_audits_v3') || '[]'),
    settings: () => JSON.parse(ls.getItem('cro_s_v3') || '{}'),
    setForm({ date, store, cro, sm } = {}) {
      if (date != null) api.el('f-date').value = date;
      if (store != null) api.el('f-store').value = store;
      if (cro != null) api.el('f-cro').value = cro;
      if (sm != null) api.el('f-sm').value = sm;
    },
    boxes: () => ({
      bills: api.el('nps-bills').value, coll: api.el('nps-coll').value, score: api.el('nps-score-inp').value,
      rev: api.el('rev-cnt').value, mktg: api.el('mktg-cnt').value, groom: api.el('groom-pct').value
    })
  };
  return api;
}

export function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function loadPlanning({ storage = {} } = {}) {
  const html = plnHtml();
  const ls = makeStorage(storage);
  const ctx = baseContext(ls);
  const toasts = [];
  vm.createContext(ctx);
  const script = inlineScript(html, 'function saveFestival');
  vm.runInContext(script, ctx, { filename: 'planning.inline.js' });
  const origToast = ctx.toast;
  ctx.toast = m => { toasts.push(String(m)); };
  void origToast;
  return {
    ctx, ls, toasts, el: id => ctx.document.getElementById(id),
    run: code => vm.runInContext(code, ctx),
    festivals: () => (JSON.parse(ls.getItem('saagar_festival_calendar_v1') || '{"festivals":[]}').festivals || [])
  };
}
