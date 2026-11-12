/* A small fake DOM for the Engine pack screen of the ETP module (owner decisions given in chat, 2026-11-12).
   It parses the real panel markup out of www/modules/etp/index.html, runs the real inline script <script id="etp-bridge-screen"> in a vm
   context and records every markup-building attempt. The element classes have NO working innerHTML, outerHTML, insertAdjacentHTML or
   document.write: any use throws, so a test fails the moment the screen builds markup from a string. */
import fs from 'node:fs';
import vm from 'node:vm';

export const MODULE_URL = new URL('../../www/modules/etp/index.html', import.meta.url);
export const moduleHtml = () => fs.readFileSync(MODULE_URL, 'utf8');

export function screenScript(html = moduleHtml()) {
  const match = /  <script id="etp-bridge-screen">\n([\s\S]*?)  <\/script>\n/.exec(html);
  if (!match) throw new Error('the engine pack screen script is missing');
  return match[1];
}
export function panelMarkup(html = moduleHtml()) {
  const match = /    <section class="etp-panel" id="panel-bridge"[\s\S]*?<\/section>\r?\n/.exec(html);
  if (!match) throw new Error('the engine pack panel is missing');
  return match[0];
}
export function tabMarkup(html = moduleHtml()) {
  const match = /    <button data-action="tab-bridge"[^\n]*\n/.exec(html);
  if (!match) throw new Error('the engine pack tab is missing');
  return match[0];
}

const VOID = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);

export class TextNode {
  constructor(data) { this.nodeType = 3; this.data = String(data); this.parentNode = null; }
  get textContent() { return this.data; }
}
export class FakeElement {
  constructor(document, tagName) {
    this.ownerDocument = document;
    this.tagName = String(tagName).toLowerCase();
    this.nodeType = 1;
    this.attrs = Object.create(null);
    this.children = [];
    this.parentNode = null;
    this.hidden = false;
    this.disabled = false;
    this.className = '';
    this.value = '';
    this.files = null;
    this.onclick = null; this.onchange = null; this.onsubmit = null; this.onfocus = null;
  }
  get id() { return this.attrs.id || ''; }
  get firstChild() { return this.children[0] || null; }
  get childNodes() { return this.children; }
  get textContent() { return this.children.map((child) => child.textContent).join(''); }
  set textContent(value) { this.children = []; if (String(value) !== '') this.appendChild(new TextNode(value)); }
  get innerHTML() { throw new Error('innerHTML must not be read'); }
  set innerHTML(value) { throw new Error('innerHTML must not be used: ' + String(value).slice(0, 40)); }
  get outerHTML() { throw new Error('outerHTML must not be read'); }
  set outerHTML(value) { throw new Error('outerHTML must not be used'); }
  insertAdjacentHTML() { throw new Error('insertAdjacentHTML must not be used'); }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this; this.children.push(child); return child;
  }
  removeChild(child) {
    const at = this.children.indexOf(child);
    if (at < 0) throw new Error('not a child');
    this.children.splice(at, 1); child.parentNode = null; return child;
  }
  setAttribute(name, value) {
    this.attrs[name] = String(value);
    if (name === 'hidden') this.hidden = true;
    if (name === 'class') this.className = String(value);
    if (name === 'disabled') this.disabled = true;
  }
  getAttribute(name) {
    if (name === 'class') return this.className || (name in this.attrs ? this.attrs[name] : null);
    return name in this.attrs ? this.attrs[name] : null;
  }
  hasAttribute(name) { return name in this.attrs; }
  removeAttribute(name) { delete this.attrs[name]; }
  focus() { this.ownerDocument.activeElement = this; this.ownerDocument.focusLog.push(this.id || this.tagName); }
  walk(visit) { for (const child of this.children) { if (child.nodeType === 1) { visit(child); child.walk(visit); } } }
}

export class FakeDocument {
  constructor() {
    this.focusLog = [];
    this.activeElement = null;
    this.created = [];
    this.body = new FakeElement(this, 'body');
    this.documentElement = { lang: 'en' };
  }
  createElement(tag) { const node = new FakeElement(this, tag); this.created.push(node); return node; }
  createTextNode(text) { return new TextNode(text); }
  getElementById(id) { let found = null; this.body.walk((node) => { if (!found && node.attrs.id === id) found = node; }); return found; }
  querySelectorAll(selector) {
    const match = /^\[([a-z-]+)\]$/.exec(selector);
    if (!match) throw new Error('unsupported selector in the fake DOM: ' + selector);
    const found = [];
    this.body.walk((node) => { if (match[1] in node.attrs) found.push(node); });
    return found;
  }
  write() { throw new Error('document.write must not be used'); }
}

/* Tolerant parser for the small, well-formed skeleton of the panel and the tab button. */
export function parseInto(document, parent, html) {
  const stack = [parent];
  const pattern = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9]+)\s*>|<([a-zA-Z0-9]+)((?:\s+[a-zA-Z_:][-a-zA-Z0-9_:.]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>|([^<]+)/g;
  let match;
  while ((match = pattern.exec(html))) {
    if (match[1]) { stack.pop(); continue; }
    if (match[2]) {
      const node = new FakeElement(document, match[2]);
      for (const attr of match[3].matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
        node.setAttribute(attr[1], attr[2] !== undefined ? attr[2] : (attr[3] !== undefined ? attr[3] : (attr[4] !== undefined ? attr[4] : '')));
      }
      if (node.attrs.class !== undefined) node.className = node.attrs.class;
      stack[stack.length - 1].appendChild(node);
      if (!VOID.has(node.tagName) && match[4] !== '/') stack.push(node);
      continue;
    }
    if (match[5] !== undefined && match[5].trim() !== '') stack[stack.length - 1].appendChild(new TextNode(match[5].trim()));
  }
  return parent;
}

export class FakeFile {
  constructor({ name = 'pack.scc-etp', size = 1000, trap = true } = {}) {
    this.name = name; this.size = size; this.reads = [];
    if (trap) {
      for (const method of ['arrayBuffer', 'text', 'stream', 'slice']) {
        Object.defineProperty(this, method, { get: () => { this.reads.push(method); throw new Error('the screen must never read the file: ' + method); }, enumerable: true });
      }
    }
  }
}

/* Builds the DOM from the real markup and loads the real script as a CommonJS-style module (the script exports itself when `module` exists). */
export function loadScreen({ html = moduleHtml(), language = 'en' } = {}) {
  const document = new FakeDocument();
  document.documentElement.lang = language;
  parseInto(document, document.body, tabMarkup(html) + panelMarkup(html));
  const module = { exports: {} };
  const sandbox = { module, document, window: {}, Promise, console: { log() {}, warn() {}, error() { throw new Error('console.error in the screen'); } } };
  vm.createContext(sandbox);
  vm.runInContext(screenScript(html), sandbox, { filename: 'etp-bridge-screen.js' });
  return { document, api: module.exports, sandbox };
}

/* A gateway double that records every call and answers from the given handlers (default: gate closed). */
export function fakeGateway(handlers = {}) {
  const calls = [];
  const wrap = (name, fallback) => (request) => {
    calls.push({ name, request });
    const handler = name in handlers ? handlers[name] : fallback;
    return typeof handler === 'function' ? handler(request, calls.length) : handler;
  };
  return {
    calls,
    gateway: {
      status: wrap('status', () => ({ ok: true, gate: 'CLOSED', access: 'OWNER', maxBytes: 33554432 })),
      stage: wrap('stage', () => ({ ok: false, code: 'ETP_BRIDGE_TRUST_GATE_CLOSED', stage: 'GATE' })),
      compare: wrap('compare', () => ({ ok: false, code: 'ETP_BRIDGE_TRUST_GATE_CLOSED', stage: 'GATE' })),
      discard: wrap('discard', () => ({ ok: true, state: 'DISCARDED' }))
    }
  };
}

export const flush = async () => { for (let i = 0; i < 12; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
/* Waits until the screen is no longer running a job (the real verifier uses WebCrypto, which takes several turns of the event loop). */
export async function settle(mounted, limitMs = 8000) {
  const until = Date.now() + limitMs;
  await flush();
  while (['checking', 'comparing', 'discarding'].includes(mounted.screen.snapshot().phase) && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 5));
  await flush();
}
/* Objects made inside the vm context have another Object.prototype; compare them as plain data. */
export const plain = (value) => JSON.parse(JSON.stringify(value));

/* Mounts the screen on a fresh fake DOM with the given gateway and language. */
export function mountScreen({ gateway, language = 'en', html, getLanguage } = {}) {
  const loaded = loadScreen({ html, language });
  const win = { onpagehide: null };
  let current = language;
  const env = { document: loaded.document, window: win, gateway: () => (typeof gateway === 'function' ? gateway() : gateway),
    language: () => (getLanguage ? getLanguage() : current) };
  const screen = loaded.api.create(env);
  const $ = (id) => loaded.document.getElementById(id);
  const text = (id) => { const node = $(id); return node ? node.textContent : null; };
  return { ...loaded, screen, win, $, text, setLanguage(next) { current = next; loaded.document.documentElement.lang = next; }, started: screen.start() };
}

export function pickFile(mounted, file) {
  const input = mounted.$('etpBridgeFile');
  input.files = file ? [file] : [];
  let shown = 'file';
  try { shown = String(file && file.name); } catch (failed) { shown = 'unreadable'; }
  input.value = file ? 'C:' + String.fromCharCode(92) + 'fakepath' + String.fromCharCode(92) + shown : '';
  if (typeof input.onchange === 'function') input.onchange({ target: input });
  return input;
}
export function submit(mounted) {
  let prevented = 0;
  const event = { preventDefault() { prevented += 1; } };
  const form = mounted.$('etpBridgeForm');
  if (typeof form.onsubmit === 'function') form.onsubmit(event);
  return prevented;
}
export function click(mounted, id) { const node = mounted.$(id); if (typeof node.onclick === 'function') node.onclick({}); return node; }
