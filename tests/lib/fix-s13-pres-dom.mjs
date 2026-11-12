// Test helper for S13 (new file): a small fake DOM for the real ETP presentations, and a loader
// for the demo stand-in that can be pointed at another file (to prove a test fails on the old stand-in).
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoDir = path.resolve(here, '..', '..');
const require = createRequire(import.meta.url);

export function loadDemo() {
  const file = process.env.S13_DEMO_FILE || path.join(repoDir, 'build-overrides', 'demo', 'etp-demo-operational.js');
  return require(file);
}
export function loadWww(name) { return require(path.join(repoDir, 'www', name)); }

export class Node {
  constructor(doc, tag = 'div') {
    this.ownerDocument = doc; this.tagName = String(tag).toUpperCase(); this.children = []; this.attributes = {};
    this.listeners = {}; this.className = ''; this.textContent = ''; this.disabled = false; this.value = ''; this.name = '';
    this.firstChild = null; this.parentNode = null;
  }
  appendChild(x) { this.children.push(x); this.firstChild = this.children[0] || null; x.parentNode = this; return x; }
  removeChild(x) { const i = this.children.indexOf(x); if (i >= 0) this.children.splice(i, 1); this.firstChild = this.children[0] || null; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; }
  addEventListener(k, v) { this.listeners[k] = v; }
  removeEventListener(k) { delete this.listeners[k]; }
  querySelector(sel) {
    const m = /^\[name="([^"]+)"\]$/.exec(sel);
    if (!m) return null;
    return all(this).find((n) => n.name === m[1]) || null;
  }
}
export class Doc { createElement(tag) { return new Node(this, tag); } }
export const all = (n) => [n].concat(n.children.flatMap(all));
export const text = (n) => all(n).map((x) => x.textContent).filter(Boolean).join(' | ');
export const host = () => new Node(new Doc());
export const tick = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

// E3: click a button by data-e3-action after filling the form it sits in.
export async function e3Click(root, action, values = {}) {
  const forms = all(root).filter((n) => n.attributes['data-e3-form']);
  const buttons = all(root).filter((n) => n.attributes['data-e3-action'] === action);
  if (!buttons.length) throw new Error('no E3 button ' + action);
  const button = buttons[0];
  const form = forms.find((f) => all(f).includes(button)) || null;
  if (form) {
    for (const k of Object.keys(values)) { const input = all(form).find((n) => n.name === k); if (input) input.value = values[k]; }
  }
  button.form = form;
  root.listeners.click({ target: button, preventDefault() {} });
  await tick();
}
