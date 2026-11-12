import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { MAH4_MESSAGE_CONTRACTS } from '../scripts/lib/mah4-protocol-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const require = createRequire(import.meta.url);
const searchSource = read('www/shared/shell-search.js');
const shell = read('www/index.html');
const i18nSource = read('www/app-i18n.js');
const manifestSource = read('www/module-manifest.js');
const DashboardPolicy = require('../www/dashboard-policy.js');
const MODULE_IDS = ['stock', 'service', 'qms', 'dsr', 'expense', 'grooming', 'cro_audit', 'payroll', 'leave', 'tax', 'planning', 'etp'];

function slice(source, start, end) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `anchor ${start}`);
  const to = source.indexOf(end, from);
  assert.ok(to > from, `end ${end}`);
  return source.slice(from, to + end.length);
}
const featureText = slice(shell, 'const FEATURE_INDEX = [', '\n];').replace('const FEATURE_INDEX = ', '').replace(/;$/, '');
const settingsText = slice(shell, 'const SETTINGS_ROUTES = Object.freeze({', '\n});').replace('const SETTINGS_ROUTES = ', '');
const reportMeta = vm.runInNewContext('(' + slice(read('www/saagar-report.js'), 'var META = {', '\n  };').replace('var META = ', '').replace(/;$/, '') + ')');
const settingRows = [...shell.matchAll(/data-settings-route="([a-z]+)" data-sub="[a-z]+" data-settings-search="([^"]*)"/g)].map(m => [m[1], m[2]]);

/* ── minimal DOM ── */
class Txt { constructor(data) { this.nodeType = 3; this.data = data; this.parentNode = null; } get textContent() { return this.data; } }
class El {
  constructor(doc, tag) {
    this.ownerDocument = doc; this.nodeType = 1; this.tagName = String(tag).toUpperCase(); this.children = [];
    this.parentNode = null; this.attrs = new Map(); this.classes = new Set(); this.style = {}; this.listeners = {};
    this.id = ''; this.value = '';
    const self = this;
    this.classList = {
      add(...n) { n.forEach(x => self.classes.add(x)); self._mut(); }, remove(...n) { n.forEach(x => self.classes.delete(x)); self._mut(); },
      contains(n) { return self.classes.has(n); }, toggle(n, on) { if (on === undefined ? !self.classes.has(n) : on) self.classes.add(n); else self.classes.delete(n); self._mut(); }
    };
  }
  _mut() { for (const o of this.observers || []) o.queue(); }
  set className(v) { this.classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this.classes].join(' '); }
  get firstChild() { return this.children[0] || null; }
  get textContent() { return this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this.children.forEach(c => { c.parentNode = null; }); this.children = []; if (String(v) !== '') this.appendChild(new Txt(String(v))); }
  appendChild(n) { if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.children.push(n); return n; }
  removeChild(n) { const i = this.children.indexOf(n); assert.ok(i >= 0, 'removeChild of a non-child'); this.children.splice(i, 1); n.parentNode = null; return n; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); if (k === 'class') this.className = v; if (k === 'id') this.id = String(v); }
  getAttribute(k) { return k === 'id' && this.id ? this.id : this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  hasAttribute(k) { return this.attrs.has(k); }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(x => x !== fn); }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  focus() { this.ownerDocument.activeElement = this; }
  scrollIntoView() {}
  all() { const out = []; const walk = n => n.children.forEach(c => { if (c.nodeType === 1) { out.push(c); walk(c); } }); walk(this); return out; }
  matches(compound) {
    const parts = compound.match(/(^[a-z0-9]+)|(#[\w-]+)|(\.[\w-]+)|(\[[\w-]+(?:="[^"]*")?\])/g) || [];
    return parts.every(p => {
      if (p[0] === '#') return this.id === p.slice(1);
      if (p[0] === '.') return this.classes.has(p.slice(1));
      if (p[0] === '[') { const m = p.match(/\[([\w-]+)(?:="([^"]*)")?\]/); return this.attrs.has(m[1]) && (m[2] === undefined || this.attrs.get(m[1]) === m[2]); }
      return this.tagName === p.toUpperCase();
    });
  }
  querySelectorAll(sel) {
    const chain = sel.split(/\s+/);
    return this.all().filter(n => {
      if (!n.matches(chain[chain.length - 1])) return false;
      let at = chain.length - 2;
      for (let p = n.parentNode; p && at >= 0; p = p.parentNode) if (p.nodeType === 1 && p.matches(chain[at])) at -= 1;
      return at < 0;
    });
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
function makeDocument() {
  const doc = { listeners: {}, activeElement: null };
  doc.createElement = tag => new El(doc, tag);
  doc.createTextNode = text => new Txt(text);
  doc.documentElement = new El(doc, 'html');
  doc.head = new El(doc, 'head');
  doc.body = new El(doc, 'body');
  doc.documentElement.appendChild(doc.head); doc.documentElement.appendChild(doc.body);
  doc.getElementById = id => doc.documentElement.all().find(n => n.id === id) || null;
  doc.querySelector = sel => doc.documentElement.querySelector(sel);
  doc.querySelectorAll = sel => doc.documentElement.querySelectorAll(sel);
  doc.addEventListener = (type, fn) => { (doc.listeners[type] = doc.listeners[type] || []).push(fn); };
  const add = (parent, tag, id, cls) => { const n = doc.createElement(tag); if (id) n.id = id; if (cls) n.className = cls; parent.appendChild(n); return n; };
  const backdrop = add(doc.body, 'div', 'modalBackdrop', 'modal-backdrop hidden');
  const modal = add(backdrop, 'div', '', 'modal');
  add(add(modal, 'div', '', 'modal-head'), 'h3', 'modalTitle').textContent = 'Details';
  add(modal, 'div', 'modalBody', 'modal-body');
  const lock = add(doc.body, 'div', 'st-v5-launch-lock'); lock.style.display = 'none';
  for (const [route, keywords] of settingRows) { const b = add(doc.body, 'button', '', 'settings-route'); b.setAttribute('data-settings-route', route); b.setAttribute('data-settings-search', keywords); }
  const opener = add(doc.body, 'button', 'opener'); opener.focus();
  return doc;
}
function fire(target, type, event = {}) {
  const ev = { type, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...event };
  for (let n = target; n; n = n.parentNode) for (const fn of (n.listeners && n.listeners[type]) || []) fn(ev);
  return ev;
}
class FakeObserver {
  constructor(fn) { this.fn = fn; this.target = null; this.live = false; }
  observe(target) { this.target = target; this.live = true; (target.observers = target.observers || []).push(this); }
  disconnect() { this.live = false; }
  queue() { if (this.live) this.fn([]); }
}

const i18nCache = {};
function realI18n(lang) {
  if (i18nCache[lang]) return i18nCache[lang];
  const storage = new Map([['saagar_lang', lang]]);
  const localStorage = { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)) };
  const document = { readyState: 'complete', documentElement: { lang: 'en' }, addEventListener() {}, querySelectorAll: () => [] };
  const window = { document, localStorage, addEventListener() {}, setTimeout(fn) { fn(); return 1; }, clearTimeout() {} };
  window.window = window;
  vm.runInNewContext(i18nSource, { window, document, localStorage, console, MutationObserver: class { observe() {} } });
  return (i18nCache[lang] = window.SaagarI18n);
}

function setup(options = {}) {
  const doc = makeDocument();
  const H = {
    calls: [], storage: [], role: options.role || 'Store Manager', lang: options.lang || 'en', pins: options.pins || {},
    access: options.access || Object.fromEntries(MODULE_IDS.map(id => [id, true])), pinOk: options.pinOk === true,
    hubTypes: options.hubTypes || ['cashStatement', 'payrollRegister', 'dsrRegister']
  };
  const spy = name => new Proxy({}, { get(_t, key) { H.storage.push([name, String(key)]); }, set(_t, key) { H.storage.push([name, String(key)]); return true; } });
  const window = { document: doc, MutationObserver: FakeObserver, innerHeight: 900, localStorage: spy('localStorage'), sessionStorage: spy('sessionStorage'), indexedDB: spy('indexedDB') };
  window.window = window;
  const ctx = vm.createContext({ window, document: doc, H, DashboardPolicy, localStorage: window.localStorage, sessionStorage: window.sessionStorage, indexedDB: window.indexedDB });
  vm.runInContext(manifestSource, ctx, { filename: 'module-manifest.js' });
  const i18n = realI18n(H.lang);
  window.SaagarI18n = { getLanguage: () => H.lang, translate: (text, lang) => i18n.translate(text, lang) };
  window.SaagarReport = {
    list: () => Object.keys(reportMeta).map(type => ({ type, title: reportMeta[type].title, scope: reportMeta[type].scope, icon: reportMeta[type].icon })),
    openHub() {
      H.calls.push(['openHub']);
      const modal = doc.querySelector('.modal'); modal.classList.add('hub-sheet');
      const body = doc.getElementById('modalBody'); body.textContent = '';
      const list = doc.createElement('div'); list.id = 'hubList'; body.appendChild(list);
      for (const type of H.hubTypes) { const r = doc.createElement('button'); r.className = 'hub-row'; r.setAttribute('data-type', type); list.appendChild(r); }
      const input = doc.createElement('input'); input.id = 'hubSearch'; body.appendChild(input);
      doc.getElementById('modalBackdrop').classList.remove('hidden');
    },
    hubFilter(q) { H.calls.push(['hubFilter', q]); }
  };
  vm.runInContext(`
    let isAdmin = ${options.admin === true};
    let activeModuleId = ${JSON.stringify(options.activeModule || null)};
    const FEATURE_INDEX = ${featureText};
    const SETTINGS_ROUTES = ${settingsText};
    function currentRole() { return H.role; }
    function moduleVisibleForRole(id) { return DashboardPolicy.moduleVisible(id, isAdmin, H.access); }
    function modulePinRequired(id) { return H.pins[id] === true; }
    function ensureModuleAccess(id) {
      H.calls.push(['ensureModuleAccess', id]);
      if (isAdmin) return true;
      if (H.access[id] !== true) return false;
      if (!modulePinRequired(id)) return true;
      H.calls.push(['pinPrompt', id]);
      return H.pinOk;
    }
    function navigateToModule(id) { H.calls.push(['navigateToModule', id]); if (ensureModuleAccess(id)) H.calls.push(['frameOpen', id]); }
    function navigateToFeature(m, t) { H.calls.push(['navigateToFeature', m, t]); navigateToModule(m); }
    function switchView(v) { H.calls.push(['switchView', v]); }
    function switchConfigTab(r) { H.calls.push(['switchConfigTab', r]); }
    function openModal() { H.calls.push(['openModal']); document.getElementById('modalBackdrop').classList.remove('hidden'); }
    function closeModal() { H.calls.push(['closeModal']); document.getElementById('modalBackdrop').classList.add('hidden'); }
    function auditLog() { H.calls.push(['auditLog']); }
    function logActivity() { H.calls.push(['logActivity']); }
    function toast() { H.calls.push(['toast']); }
  `, ctx);
  vm.runInContext(searchSource, ctx, { filename: 'shell-search.js' });
  const raw = window.SaagarShellSearch;
  const api = { raw, version: raw.version, open: () => raw.open(), close: () => raw.close(), isOpen: () => raw.isOpen(), query: t => plain(raw.query(t)), entries: () => plain(raw.entries()), create: e => raw.create(e) };
  const run = code => vm.runInContext(code, ctx);
  return { api, doc, H, ctx, run, window };
}
const plain = value => JSON.parse(JSON.stringify(value));
const ids = result => result.hits.map(h => h.id);
const calls = (env, name) => plain(env.H.calls).filter(c => c[0] === name);

test('normaliser folds case, Devanagari digits, joiners, danda, hyphens and spaces', () => {
  const { api } = setup();
  const n = api.create({}).normalise;
  assert.equal(n('  Walk-In  '), 'walk in');
  assert.equal(n('walk in'), n('WALK-IN'));
  assert.equal(n('पगार'), 'पगार');
  assert.equal(n('१२३ abc'), '123 abc');
  assert.equal(n('क‍ष क‌ष'), 'कष कष');
  assert.equal(n('पगार। वेतन — रजा'), 'पगार वेतन रजा');
  assert.equal(n(null), '');
  const env = setup();
  for (const q of ['walk-in', 'walk in', 'walkin', 'WALK IN']) assert.ok(ids(env.api.query(q)).includes('s:qms:walkin'), q);
});

test('matching is AND over words, ranks word-start above contains, exact label first, caps at 12 and groups by kind', () => {
  const env = setup({ admin: true });
  const salary = env.api.query('salary advance');
  assert.ok(ids(salary).includes('s:payroll:advance'));
  assert.ok(!ids(env.api.query('salary zzzzqqq')).length);
  assert.equal(env.api.query('zzzzqqq').groups.length, 0);
  const exact = env.api.query('Petty cash');
  assert.equal(exact.hits[0].label.toLowerCase(), 'petty cash');
  const start = env.api.query('stoc');
  assert.equal(start.hits[0].id, 'm:stock', 'a module whose label word starts with the text comes first');
  const contains = env.api.query('ayrol');
  assert.ok(contains.hits.length && contains.hits[0].score < 100, 'contains scores below word-start');
  const action = env.api.query('Petty cash').hits.filter(h => h.id === 'a:expense:petty')[0];
  const screen = env.api.query('Petty cash').hits.filter(h => h.id === 's:expense:petty')[0];
  assert.ok(action && screen && action.score === screen.score - 1, 'a quick action ranks just under its screen');
  const broad = env.api.query('a');
  assert.ok(broad.hits.length === 12, 'result cap');
  const order = ['module', 'screen', 'report', 'setting', 'action'];
  const kinds = broad.groups.map(g => g.kind);
  assert.deepEqual(kinds, order.filter(k => kinds.includes(k)), 'groups follow the fixed kind order');
  assert.deepEqual(broad.hits.map(h => h.id), broad.groups.flatMap(g => g.items.map(i => i.id)));
});

test('empty query shows quick actions, recent places (memory only) and the first six modules', () => {
  const env = setup({ admin: true });
  const home = env.api.query('');
  assert.deepEqual(home.groups.map(g => g.kind), ['action', 'module']);
  assert.equal(home.groups[0].items.length, 4);
  assert.equal(home.groups[1].items.length, 6);
  const probe = env.api.create(Object.assign({}, {}));
  assert.equal(typeof probe.open, 'function');
});

test('role filtering uses the shell visibility function: hidden modules never appear in any kind', () => {
  const none = Object.fromEntries(MODULE_IDS.map(id => [id, false]));
  const hiddenAll = setup({ access: none });
  const kinds = new Set(hiddenAll.api.query('a').hits.map(h => h.kind));
  assert.ok(![...kinds].some(k => ['module', 'screen', 'action'].includes(k)), 'no module, screen or action for a role with no access');
  const everything = ['a', 'e', 'o', 'r', 'i', 's', 'payroll', 'report', 'cash', 'tax'].flatMap(q => hiddenAll.api.query(q).hits);
  for (const hit of everything) assert.ok(!hit.module, `${hit.id} must not belong to a module`);
  const owner = new Set(hiddenAll.api.query('owner').hits.filter(h => h.kind === 'report').map(h => h.type));
  assert.ok(owner.has('ownerBrief') && owner.has('ownerMonthly'), 'owner-level reports have no module and stay visible, as in the Reports tab');
  assert.ok(hiddenAll.api.query('security').hits.some(h => h.kind === 'setting'), 'settings are not role-filtered');
  for (const only of MODULE_IDS) {
    const access = Object.fromEntries(MODULE_IDS.map(id => [id, id === only]));
    const env = setup({ access });
    const all = ['a', 'e', 'i', 'o', 'u', 'r', 's', 't', 'report', 'cash', 'pay', 'new'].flatMap(q => env.api.query(q).hits);
    for (const hit of all) if (hit.module) assert.equal(hit.module, only, `${hit.id} leaked past the ${only} role`);
  }
  const base = setup({ access: Object.fromEntries(MODULE_IDS.map(id => [id, id === 'stock'])) });
  const full = base.api.entries();
  assert.ok(full.every(e => !e.module || e.module === 'stock'));
  assert.ok(!full.some(e => e.id === 'm:payroll'));
});

test('PIN lock flag is set exactly when the module needs a PIN and the person is not admin', () => {
  const staff = setup({ pins: { payroll: true, tax: true } });
  const byId = Object.fromEntries(staff.api.entries().map(e => [e.id, e]));
  assert.equal(byId['m:payroll'].locked, true);
  assert.equal(byId['s:payroll:slip'].locked, true);
  assert.equal(byId['r:payrollRegister'].locked, true);
  assert.equal(byId['m:stock'].locked, false);
  assert.equal(byId['r:ownerBrief'].locked, false);
  const admin = setup({ admin: true, pins: { payroll: true } });
  assert.equal(admin.api.entries().find(e => e.id === 'm:payroll').locked, false, 'admin has no PIN prompt, so no lock');
  const live = setup({ pins: { stock: true } });
  assert.equal(live.api.query('stock').hits[0].locked, true);
  live.H.pins = {};
  assert.equal(live.api.query('stock').hits[0].locked, false, 'a changed PIN policy rebuilds the index');
});

test('every module and screen is findable in English, Marathi and Hindi, and by romanised words', () => {
  for (const lang of ['en', 'mr', 'hi']) {
    const env = setup({ admin: true, lang });
    const i18n = realI18n(lang);
    const manifest = env.window.SaagarModuleManifest.modules;
    for (const m of manifest) {
      assert.ok(ids(env.api.query(m.short)).includes('m:' + m.id), `${lang}: ${m.short} by English name`);
      assert.ok(ids(env.api.query(i18n.translate(m.short, lang))).includes('m:' + m.id), `${lang}: ${m.short} by translated name`);
    }
    for (const row of JSON.parse(JSON.stringify(vm.runInContext(featureText, vm.createContext({}))))) {
      assert.ok(ids(env.api.query(row.label)).includes(`s:${row.module}:${row.target}`), `${lang}: screen ${row.label}`);
    }
  }
  const env = setup({ admin: true, lang: 'en' });
  const first = (q, id) => assert.equal(env.api.query(q).hits[0].id, id, q);
  first('pagar', 'm:payroll');
  first('पगार', 'm:payroll');
  first('वेतन', 'm:payroll');
  first('kharch', 'm:expense');
  first('खर्च', 'm:expense');
  first('chutti', 'm:leave');
  first('दुरुस्ती', 'm:service');
  assert.ok(ids(env.api.query('uchal')).includes('s:payroll:advance'));
  assert.ok(ids(env.api.query('अहवाल')).some(id => id.startsWith('r:')), 'Marathi word for reports finds reports');
  const hi = setup({ admin: true, lang: 'hi' });
  assert.equal(hi.api.query('payroll').hits[0].id, 'm:payroll', 'English words work in a Hindi app');
  const mr = setup({ admin: true, lang: 'mr' });
  assert.equal(mr.api.query('rokad').hits.length > 0, true, 'romanised Marathi works in a Marathi app');
  assert.ok(mr.api.entries().every(e => e.label.length > 0));
});

test('every screen and quick action is an allowed MAH-4 open-feature target', () => {
  const env = setup({ admin: true });
  const entries = env.api.entries().filter(e => e.kind === 'screen' || e.kind === 'action');
  assert.equal(entries.filter(e => e.kind === 'screen').length, 36);
  assert.equal(entries.filter(e => e.kind === 'action').length, 4);
  for (const e of entries) {
    assert.equal(MAH4_MESSAGE_CONTRACTS.ST_OPEN_FEATURE.envelopeCrossValidate({ moduleId: e.module, payload: { target: e.target } }), null, e.id);
  }
});

test('REPORT_MODULE covers every report type and only names real modules', () => {
  const env = setup({ admin: true });
  const map = plain(env.api.create({}).reportModules);
  assert.deepEqual(Object.keys(reportMeta).filter(type => !(type in map)), [], 'a report type is missing from REPORT_MODULE');
  assert.deepEqual(Object.keys(map).filter(type => !(type in reportMeta)), [], 'REPORT_MODULE names an unknown type');
  for (const mod of Object.values(map)) assert.ok(mod === '' || MODULE_IDS.includes(mod), mod);
  assert.equal(env.api.entries().filter(e => e.kind === 'report').length, Object.keys(reportMeta).length);
  const noAdmin = setup({});
  noAdmin.window.SaagarReport.list = () => [{ type: 'zzFreshReport', title: 'Zzfresh report', scope: 'daily', icon: 'x' }];
  assert.equal(noAdmin.api.query('zzfresh').hits.length, 0, 'an unmapped report type stays hidden for a non-admin');
});

test('ETP appears by module name only and the file never touches ETP data or globals', () => {
  const env = setup({ admin: true });
  const etp = env.api.entries().filter(e => e.module === 'etp');
  assert.deepEqual(etp.map(e => e.id), ['m:etp']);
  assert.equal(etp[0].label, 'Retail ETP');
  for (const bad of ['SaagarEtp', 'etp-', 'etp_', 'retail_etp', 'SaagarOperational']) assert.ok(!searchSource.includes(bad), bad);
});

test('static checks on the search file', () => {
  const bytes = Buffer.byteLength(searchSource);
  assert.ok(bytes <= 32768, `size ${bytes}`);
  assert.ok(!searchSource.includes('\r'), 'LF only');
  assert.notEqual(searchSource.charCodeAt(0), 0xfeff, 'no BOM');
  assert.ok(searchSource.startsWith('(function'));
  assert.doesNotMatch(searchSource, /\bcatch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\s*)?\}/, 'no empty catch');
  const banned = ['localStorage', 'sessionStorage', 'indexedDB', 'safeSet', 'store.set(', 'console.', 'auditLog', 'logActivity', 'toast', 'alert(', 'showError', 'renderError',
    'document.write', "createElement('script')", 'createElement("script")', 'import(', 'postMessage', 'eval(', 'new Function', '.innerHTML', 'outerHTML', 'insertAdjacentHTML', 'fetch(', 'XMLHttpRequest',
    'window.open', '.src =', '.href =', 'ST_', 'SaagarReauth', 'SaagarAccess', 'accessContext', 'canAccess', 'hasPermission', 'requireRole', 'roleAllows', 'isSuperAdmin', 'ownerOnly', 'SaagarOwnerSession',
    'openModule(', 'SaagarShellModuleFrameController'];
  for (const token of banned) assert.ok(!searchSource.includes(token), `forbidden token ${token}`);
  assert.doesNotMatch(searchSource, /addEventListener\(\s*['"](?:message|load)['"]/);
  assert.doesNotMatch(searchSource, /setAttribute\(\s*['"](?:src|href)['"]/);
  assert.doesNotMatch(searchSource, /\.(?:textContent|innerText|ariaLabel|title|placeholder)\s*=\s*['"]/, 'no literal user-facing text');
  assert.doesNotMatch(searchSource, /setAttribute\(\s*['"](?:aria-label|title|placeholder)['"]\s*,\s*['"]/);
  assert.doesNotMatch(searchSource, /\breturn\s+(?:null|false|\[\]|\{\})/, 'no new fallback-return sites');
  assert.doesNotMatch(searchSource, /\b(?:throw\s+[A-Za-z_$]|fallback)\b/i);
  assert.doesNotMatch(searchSource, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, 'theme tokens only');
  assert.ok((searchSource.match(/\bcatch\b/g) || []).length <= 1);
});

test('open is refused while a module, the launch lock or another modal is up', () => {
  const inModule = setup({ admin: true, activeModule: 'stock' });
  inModule.api.open();
  assert.equal(inModule.api.isOpen(), false);
  assert.equal(calls(inModule, 'openModal').length, 0);
  const locked = setup({ admin: true });
  locked.doc.getElementById('st-v5-launch-lock').style.display = 'flex';
  locked.api.open();
  assert.equal(locked.api.isOpen(), false);
  const busy = setup({ admin: true });
  busy.doc.getElementById('modalBackdrop').classList.remove('hidden');
  busy.api.open();
  assert.equal(busy.api.isOpen(), false);
  assert.equal(busy.doc.getElementById('modalBody').children.length, 0, 'another modal is left untouched');
  const ok = setup({ admin: true });
  ok.api.open();
  assert.equal(ok.api.isOpen(), true);
  assert.equal(calls(ok, 'openModal').length, 1);
});

test('panel opens on the shell modal, sets accessible roles, and is torn down by any close path', () => {
  const env = setup({ admin: true });
  const { doc } = env;
  env.api.open();
  const modal = doc.querySelector('.modal');
  const backdrop = doc.getElementById('modalBackdrop');
  const input = doc.querySelector('.sgs-input');
  assert.ok(modal.classes.has('sgs-sheet') && backdrop.classes.has('sgs-top'));
  assert.equal(modal.getAttribute('role'), 'dialog');
  assert.equal(modal.hasAttribute('data-no-i18n'), true);
  assert.equal(input.getAttribute('role'), 'combobox');
  assert.equal(doc.activeElement, input, 'input takes focus inside the opening gesture');
  assert.equal(doc.getElementById('modalTitle').textContent, 'Search');
  assert.equal(doc.getElementById('sgs-style').tagName, 'STYLE');
  assert.ok(doc.querySelectorAll('.sgs-row').length > 0);
  // hardware Back runs closeModal() only
  env.run('closeModal()');
  assert.equal(env.api.isOpen(), false);
  assert.ok(!modal.classes.has('sgs-sheet') && !backdrop.classes.has('sgs-top'));
  assert.equal(modal.hasAttribute('role'), false);
  assert.equal(modal.hasAttribute('data-no-i18n'), false);
  assert.equal(doc.getElementById('modalBody').children.length, 0);
  assert.equal(doc.activeElement.id, 'opener', 'focus returns to the opener');
  // Escape
  env.api.open();
  fire(doc.querySelector('.sgs-input'), 'keydown', { key: 'Escape' });
  assert.equal(env.api.isOpen(), false);
  assert.ok(backdrop.classes.has('hidden'));
  // close button and Ctrl+K toggle
  env.api.open();
  fire(doc.querySelector('.sgs-close'), 'click');
  assert.equal(env.api.isOpen(), false);
  const ctrlK = () => doc.listeners.keydown.forEach(fn => fn({ key: 'k', ctrlKey: true, preventDefault() {} }));
  ctrlK();
  assert.equal(env.api.isOpen(), true);
  ctrlK();
  assert.equal(env.api.isOpen(), false);
  env.run("activeModuleId = 'stock'");
  ctrlK();
  assert.equal(env.api.isOpen(), false, 'Ctrl+K is ignored inside a module');
});

test('typing, arrows, Enter and IME composition behave on the panel', () => {
  const env = setup({ admin: true });
  const { doc } = env;
  env.api.open();
  const input = doc.querySelector('.sgs-input');
  const type = value => { input.value = value; fire(input, 'input'); };
  assert.equal(doc.querySelector('.sgs-row[aria-selected="true"]'), null, 'nothing is highlighted on an empty box');
  fire(input, 'keydown', { key: 'Enter' });
  assert.equal(env.api.isOpen(), true, 'Enter on an empty box does nothing');
  type('payroll');
  const rows = () => doc.querySelectorAll('.sgs-row');
  assert.ok(rows().length > 1);
  assert.equal(rows()[0].getAttribute('aria-selected'), 'true');
  assert.equal(input.getAttribute('aria-activedescendant'), rows()[0].id);
  fire(input, 'keydown', { key: 'ArrowDown' });
  assert.equal(rows()[1].getAttribute('aria-selected'), 'true');
  fire(input, 'keydown', { key: 'ArrowUp' });
  fire(input, 'keydown', { key: 'ArrowUp' });
  assert.equal(rows()[0].getAttribute('aria-selected'), 'true', 'clamped at the top');
  const tab = fire(input, 'keydown', { key: 'Tab' });
  assert.equal(tab.defaultPrevented, true);
  assert.equal(doc.activeElement.className.includes('sgs-close'), true, 'Tab moves to the Close button and stays inside the panel');
  fire(doc.querySelector('.sgs-close'), 'keydown', { key: 'Tab' });
  assert.equal(doc.activeElement, input);
  const marks = doc.querySelectorAll('mark');
  assert.ok(marks.length > 0, 'matched text is highlighted with mark nodes');
  fire(input, 'keydown', { key: 'Enter', isComposing: true });
  fire(input, 'keydown', { key: 'Enter', keyCode: 229 });
  assert.equal(env.api.isOpen(), true, 'Enter during IME composition is ignored');
  assert.equal(calls(env, 'navigateToModule').length, 0);
  type('zzzzqqq');
  assert.equal(doc.querySelector('.sgs-empty').textContent, 'No match. Try a module or report name.');
  assert.equal(rows().length, 0);
});

test('the panel text follows the app language and keeps the English name on a second line', () => {
  const env = setup({ admin: true, lang: 'mr' });
  env.api.open();
  const { doc } = env;
  assert.equal(doc.getElementById('modalTitle').textContent, 'शोधा');
  assert.equal(doc.querySelector('.sgs-close').textContent, 'बंद करा');
  assert.ok(doc.querySelector('.sgs-input').getAttribute('placeholder').includes('शोधा'));
  const hit = env.api.query('Payroll').hits.find(h => h.id === 'm:payroll');
  assert.ok(hit.label.length > 0);
  if (hit.label !== hit.en) assert.ok(hit.sub.includes('Payroll'));
});

test('locked module: choosing it closes the panel, then goes through the shell opener and its PIN prompt', () => {
  const env = setup({ pins: { payroll: true }, pinOk: false });
  const { doc } = env;
  env.api.open();
  const input = doc.querySelector('.sgs-input');
  input.value = 'payroll'; fire(input, 'input');
  const row = doc.querySelectorAll('.sgs-row')[0];
  assert.ok(row.textContent.length > 0 && row.querySelectorAll('.sgs-lock').length === 1, 'the lock is shown');
  assert.ok(row.querySelectorAll('.sgs-sr')[0].textContent === 'PIN required');
  env.H.calls.length = 0;
  fire(row, 'click');
  const names = plain(env.H.calls).map(c => c[0]);
  assert.deepEqual(names.slice(0, 2), ['closeModal', 'navigateToModule']);
  assert.deepEqual(calls(env, 'navigateToModule'), [['navigateToModule', 'payroll']]);
  assert.ok(names.includes('ensureModuleAccess') && names.includes('pinPrompt'), 'the existing PIN prompt ran');
  assert.ok(!names.includes('frameOpen'), 'a wrong or cancelled PIN opens nothing');
  assert.equal(env.api.isOpen(), false);
  const ok = setup({ pins: { payroll: true }, pinOk: true });
  ok.api.open();
  const oi = ok.doc.querySelector('.sgs-input'); oi.value = 'payroll'; fire(oi, 'input');
  fire(ok.doc.querySelectorAll('.sgs-row')[0], 'click');
  assert.ok(calls(ok, 'frameOpen').length === 1);
});

test('search never reaches a module opener except through navigateToModule and ensureModuleAccess', () => {
  assert.match(shell, /function navigateToModule\(id, date\)\{[\s\S]*?\n  openModule\(id\);\n\}/);
  assert.match(shell, /function openModule\(id\)\{\s*return window\.SaagarShellModuleFrameController\.open\(id,\{[^}]*ensureModuleAccess:ensureModuleAccess/);
  const controller = read('www/shared/shell-module-frame-controller.js');
  assert.match(controller, /if \(!shell\.ensureModuleAccess\(id\)\) return;/);
  assert.ok(!/openModule|SaagarShellModuleFrameController|frameOpen|srcdoc/.test(searchSource));
});

test('choosing a screen, quick action, setting or report uses the existing shell functions in the right order', () => {
  const env = setup({ admin: true });
  const open = (query, id) => {
    env.run('closeModal()');
    env.doc.querySelector('.modal').classes.delete('hub-sheet');
    env.H.calls.length = 0;
    env.api.open();
    const input = env.doc.querySelector('.sgs-input');
    input.value = query; fire(input, 'input');
    const hit = env.api.query(query).hits.find(h => h.id === id);
    assert.ok(hit, id);
    const rows = env.doc.querySelectorAll('.sgs-row');
    const at = [...rows].findIndex(r => r.textContent.includes(hit.label));
    assert.ok(at >= 0);
    env.H.calls.length = 0;
    fire(rows[at], 'click');
    return plain(env.H.calls).map(c => c.join(':'));
  };
  assert.deepEqual(open('Salary slip', 's:payroll:slip').slice(0, 2), ['closeModal', 'navigateToFeature:payroll:slip']);
  assert.deepEqual(open('Add walk-in', 'a:qms:walkin').slice(0, 2), ['closeModal', 'navigateToFeature:qms:walkin']);
  const settings = open('Security', 't:security');
  assert.deepEqual(settings.slice(0, 3), ['closeModal', 'switchView:config', 'switchConfigTab:security']);
  const report = open('Daily Cash Statement', 'r:cashStatement');
  assert.equal(report.includes('closeModal'), false, 'the report sheet reuses the modal, so the modal is not closed');
  assert.deepEqual(report.filter(c => /^(ensureModuleAccess|openHub|hubFilter)/.test(c)), ['ensureModuleAccess:expense', 'openHub', 'hubFilter:Daily Cash Statement']);
  assert.equal(env.doc.getElementById('hubSearch').value, 'Daily Cash Statement', 'the hub search box shows the filter');
  assert.ok(env.doc.querySelector('.modal').classes.has('hub-sheet') && !env.doc.querySelector('.modal').classes.has('sgs-sheet'));
  assert.equal(env.api.isOpen(), false);
  // a report that the hub does not list is not filtered to nothing
  env.H.hubTypes = [];
  const unlisted = open('Daily Cash Statement', 'r:cashStatement');
  assert.ok(unlisted.includes('openHub') && !unlisted.some(c => c.startsWith('hubFilter')));
  // owner-level report asks for no module access
  env.H.hubTypes = ['ownerBrief'];
  const brief = open('Daily Owner Brief', 'r:ownerBrief');
  assert.ok(!brief.some(c => c.startsWith('ensureModuleAccess')));
  // a denied PIN for a mapped report leaves the panel open and opens nothing
  const gated = setup({ pins: { payroll: true }, pinOk: false });
  gated.api.open();
  const gi = gated.doc.querySelector('.sgs-input'); gi.value = 'Salary Register'; fire(gi, 'input');
  gated.H.calls.length = 0;
  fire(gated.doc.querySelectorAll('.sgs-row')[0], 'click');
  assert.equal(calls(gated, 'openHub').length, 0);
  assert.equal(gated.api.isOpen(), true);
});

test('recent places live in memory only and an unavailable report hub falls back to closing the modal', () => {
  const env = setup({ admin: true });
  env.api.open();
  const input = env.doc.querySelector('.sgs-input');
  input.value = 'Petty cash'; fire(input, 'input');
  fire(env.doc.querySelectorAll('.sgs-row')[0], 'click');
  const home = env.api.query('');
  assert.ok(home.groups.some(g => g.kind === 'recent' && g.items.length === 1));
  assert.equal(env.H.storage.length, 0, 'no storage access of any kind');
  const broken = setup({ admin: true });
  broken.window.SaagarReport.openHub = () => { broken.H.calls.push(['openHub']); throw new Error('hub missing'); };
  broken.api.open();
  const bi = broken.doc.querySelector('.sgs-input'); bi.value = 'Daily Cash Statement'; fire(bi, 'input');
  fire(broken.doc.querySelectorAll('.sgs-row')[0], 'click');
  assert.equal(calls(broken, 'closeModal').length, 1);
  assert.equal(broken.api.isOpen(), false);
});

test('nothing is stored or logged by opening, typing, choosing or closing', () => {
  const env = setup({ admin: true, pins: { tax: true } });
  env.api.open();
  const input = env.doc.querySelector('.sgs-input');
  for (const q of ['t', 'ta', 'tax', 'gst', '']) { input.value = q; fire(input, 'input'); }
  fire(input, 'keydown', { key: 'ArrowDown' });
  fire(env.doc.querySelector('.sgs-close'), 'click');
  env.api.open();
  input.value = 'gst';
  const again = env.doc.querySelector('.sgs-input'); again.value = 'gst'; fire(again, 'input');
  fire(env.doc.querySelectorAll('.sgs-row')[0], 'click');
  assert.deepEqual(env.H.storage, [], 'localStorage, sessionStorage and indexedDB were never touched');
  for (const name of ['auditLog', 'logActivity', 'toast']) assert.equal(calls(env, name).length, 0, name);
});

test('only version 1 surface: frozen API, nothing runs at load except one keydown listener', () => {
  const env = setup({ admin: true });
  assert.equal(Object.isFrozen(env.api.raw), true);
  assert.deepEqual(Object.keys(env.api.raw).sort(), ['close', 'create', 'entries', 'isOpen', 'open', 'query', 'version']);
  assert.equal(env.api.version, 1);
  assert.equal(Object.getOwnPropertyDescriptor(env.window, 'SaagarShellSearch').writable, false);
  const fresh = makeDocument();
  const ctx = vm.createContext({ window: { document: fresh }, document: fresh });
  ctx.window.window = ctx.window;
  vm.runInContext(searchSource, ctx);
  assert.deepEqual(Object.keys(fresh.listeners), ['keydown']);
  assert.equal(fresh.getElementById('sgs-style'), null, 'no CSS is injected before first use');
  assert.equal(fresh.documentElement.all().length, makeDocument().documentElement.all().length, 'no DOM is built at load');
});

test('index.html carries one deferred script tag, one top-bar button, the Modules-box role guard and stays under the byte rule', () => {
  assert.equal((shell.match(/<script[^>]*shared\/shell-search\.js/g) || []).length, 1);
  assert.match(shell, /<script defer src="shared\/shell-search\.js"><\/script>\n<\/body>/);
  assert.equal((shell.match(/data-action="open-global-search"/g) || []).length, 1);
  assert.match(shell, /<button data-action="open-global-search" class="icon-btn" aria-label="Search" onclick="if\(window\.SaagarShellSearch\)SaagarShellSearch\.open\(\)" title="Search">/);
  assert.ok(shell.indexOf('data-action="open-global-search"') < shell.indexOf('data-action="share-today-brief"'));
  assert.ok(shell.indexOf('data-action="toggle-ui-mode"') < shell.indexOf('data-action="open-global-search"'));
  assert.equal((shell.match(/document\.write\(/g) || []).length, 2, 'document.write count unchanged');
  assert.ok(Buffer.byteLength(shell) < 580636, `index.html is ${Buffer.byteLength(shell)} bytes`);
  assert.doesNotMatch(shell, /<script[^>]*src="shared\/shell-search\.js"[^>]*(?:async|type="module")/);
  assert.match(shell, /if\(!m\|\|!moduleVisibleForRole\(f\.module\)\) return false;\n    if\(!\(activeCategory/);
});

test('Modules-box feature results hide features of modules the role cannot see', () => {
  const fn = slice(shell, 'function featureResultsHTML(q){', '\n}\n');
  const hidden = new Set(['payroll']);
  const ctx = vm.createContext({
    activeCategory: 'All', moduleById: id => ({ id, category: 'x', icon: 'i', short: id }), moduleVisibleForRole: id => !hidden.has(id),
    FEATURE_INDEX: [{ label: 'Salary slip', keywords: ['slip'], module: 'payroll', target: 'slip' }, { label: 'Stock slip', keywords: ['slip'], module: 'stock', target: 'movement' }],
    MODULES: [{ id: 'payroll', icon: 'i', short: 'payroll' }, { id: 'stock', icon: 'i', short: 'stock' }], escapeHtml: v => String(v)
  });
  vm.runInContext(fn, ctx);
  const html = vm.runInContext("featureResultsHTML('slip')", ctx);
  assert.ok(html.includes('Stock slip'));
  assert.ok(!html.includes('Salary slip'), 'features of a hidden module must not be listed');
  hidden.clear();
  assert.ok(vm.runInContext("featureResultsHTML('slip')", ctx).includes('Salary slip'));
});

test('the shell asset manifest records the search file by bytes and hash', async () => {
  const crypto = await import('node:crypto');
  const context = vm.createContext({ window: {} });
  vm.runInContext(read('www/shell-asset-manifest.js'), context);
  const entry = context.window.SaagarShellAssetManifest.get('shell-search');
  assert.ok(entry);
  const bytes = fs.readFileSync(path.join(root, 'www/shared/shell-search.js'));
  assert.equal(entry.file, 'shared/shell-search.js');
  assert.equal(entry.bytes, bytes.length);
  assert.equal(entry.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
});
