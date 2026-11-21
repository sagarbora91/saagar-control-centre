// Minimal fake DOM for the Service Stores masters UI tests (no jsdom).
// It parses the small, well formed HTML that the UI renders and offers just enough of the DOM for the controller:
// getAttribute, parentNode, tagName, value, checked, type, id, textContent, querySelector, addEventListener.

const VOID = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);

export function decode(text) {
  return String(text)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#96;/g, '`')
    .replace(/&amp;/g, '&');
}

export class FakeElement {
  constructor(tag, attrs, parent) {
    this.tagName = tag.toUpperCase();
    this.attrs = attrs || {};
    this.parentNode = parent || null;
    this.children = [];
    this._text = '';
    this._value = undefined;
    this._checked = undefined;
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name);
  }

  get id() { return this.attrs.id || ''; }

  get type() { return this.attrs.type || (this.tagName === 'INPUT' ? 'text' : ''); }

  get textContent() {
    let out = this._text;
    for (const c of this.children) out += c.textContent;
    return out;
  }

  get value() {
    if (this._value !== undefined) return this._value;
    if (this.tagName === 'TEXTAREA') return this.textContent;
    if (this.tagName === 'SELECT') {
      const opts = this.descendants().filter((e) => e.tagName === 'OPTION');
      const chosen = opts.find((o) => o.hasAttribute('selected')) || opts[0];
      return chosen ? chosen.getAttribute('value') : '';
    }
    return this.attrs.value === undefined ? '' : this.attrs.value;
  }

  set value(v) { this._value = String(v); }

  get checked() {
    if (this._checked !== undefined) return this._checked;
    return this.hasAttribute('checked');
  }

  set checked(v) { this._checked = !!v; }

  descendants() {
    const out = [];
    const walk = (n) => { for (const c of n.children) { out.push(c); walk(c); } };
    walk(this);
    return out;
  }

  classes() { return (this.attrs.class || '').split(/\s+/).filter(Boolean); }
}

// Tokeniser for the UI output. Throws on a mismatched tag so a broken template fails a test.
export function parseHtml(html) {
  const root = new FakeElement('root', {}, null);
  let cur = root;
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9]+)\s*>|<([a-zA-Z0-9]+)((?:\s+[^\s=>/]+(?:\s*=\s*"[^"]*")?)*)\s*\/?>|([^<]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) {
      const tag = m[1].toUpperCase();
      if (cur.tagName !== tag) throw new Error('mismatched close tag </' + m[1] + '> inside <' + cur.tagName.toLowerCase() + '>');
      cur = cur.parentNode;
    } else if (m[2]) {
      const attrs = {};
      const aRe = /([^\s=>/]+)(?:\s*=\s*"([^"]*)")?/g;
      let a;
      while ((a = aRe.exec(m[3])) !== null) attrs[a[1]] = a[2] === undefined ? '' : decode(a[2]);
      const el = new FakeElement(m[2], attrs, cur);
      cur.children.push(el);
      if (!VOID.has(m[2].toLowerCase()) && !/\/>$/.test(m[0])) cur = el;
    } else if (m[4]) {
      const holder = new FakeElement('#text', {}, cur);
      holder._text = decode(m[4]);
      cur.children.push(holder);
    }
  }
  if (cur !== root) throw new Error('unclosed tag <' + cur.tagName.toLowerCase() + '>');
  return root;
}

export class FakeHost {
  constructor() {
    this._html = '';
    this.root = new FakeElement('root', {}, null);
    this.listeners = [];
    this.removed = [];
    this.activeElement = null;
    this.ownerDocument = this;
    this.renders = 0;
  }

  get innerHTML() { return this._html; }

  set innerHTML(v) {
    this._html = String(v);
    this.renders += 1;
    this.root = parseHtml(this._html);
    this.root.parentNode = this;
  }

  addEventListener(type, fn) { this.listeners.push({ type, fn }); }

  removeEventListener(type, fn) {
    const i = this.listeners.findIndex((l) => l.type === type && l.fn === fn);
    if (i >= 0) { this.listeners.splice(i, 1); this.removed.push(type); }
  }

  contains(el) {
    let n = el;
    while (n) { if (n === this.root || n === this) return true; n = n.parentNode; }
    return false;
  }

  all() { return this.root.descendants(); }

  byAction(action, key) {
    return this.all().filter((e) => e.getAttribute && e.getAttribute('data-svcs-action') === action
      && (key === undefined || e.getAttribute('data-svs-key') === key));
  }

  one(action, key) {
    const hits = this.byAction(action, key);
    if (hits.length !== 1) throw new Error('expected 1 element for ' + action + (key ? ' ' + key : '') + ' but found ' + hits.length);
    return hits[0];
  }

  byName(name) { return this.all().find((e) => e.getAttribute && e.getAttribute('data-svcm-name') === name) || null; }

  byId(id) { return this.all().find((e) => e.id === id) || null; }

  querySelector(sel) {
    let m = /^\[data-svcm-name="([^"]*)"\]$/.exec(sel);
    if (m) return this.byName(m[1]);
    m = /^#(.+)$/.exec(sel);
    if (m) return this.byId(m[1]);
    return null;
  }

  text() { return this.root.textContent; }

  fire(type, target) {
    const ev = { type, target };
    for (const l of this.listeners.slice()) { if (l.type === type) l.fn(ev); }
  }
}

export function settle(times = 6) {
  let p = Promise.resolve();
  for (let i = 0; i < times; i += 1) p = p.then(() => new Promise((r) => setImmediate(r)));
  return p;
}
