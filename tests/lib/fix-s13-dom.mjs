// Test helper for S13 (new file): a tiny fake DOM, plus a function that lifts renderScopeDetail
// out of the real www/modules/etp/index.html text so it runs against a fake document.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoDir = path.resolve(here, '..', '..');
export const etpModulePath = path.join(repoDir, 'www', 'modules', 'etp', 'index.html');

export class El {
  constructor(tag, id) {
    this.tag = tag; this.id = id || ''; this.children = []; this.hidden = false; this.className = '';
    this.style = {}; this._text = '';
  }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(' '); }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren() { this.children = []; this._text = ''; }
}

export class Doc {
  constructor(ids) { this.byId = {}; for (const id of ids) this.byId[id] = new El('div', id); }
  getElementById(id) { return this.byId[id] || null; }
  createElement(tag) { return new El(tag); }
}

function slice(source, startMarker, endMarker) {
  const a = source.indexOf(startMarker);
  const b = source.indexOf(endMarker, a);
  if (a < 0 || b < 0) throw new Error('marker not found: ' + startMarker);
  return source.slice(a, b);
}

// Returns { render(result) -> { detail, host, heading } } built from the real module text.
export function loadRenderScopeDetail() {
  const source = fs.readFileSync(etpModulePath, 'utf8');
  const textFn = slice(source, 'function text(element, value)', '\n');
  const appendMetric = slice(source, 'function appendMetric(host, label, value) {', 'function renderScopeDetail(result) {');
  const renderFn = slice(source, 'function renderScopeDetail(result) {', 'function renderScopeError(code) {');
  const factory = new Function('document', 'REPORTS', textFn + '\n' + appendMetric + '\n' + renderFn + '\nreturn renderScopeDetail;');
  return function render(result) {
    const doc = new Doc(['etpScopeDetail', 'etpScopeSummary', 'etpScopeHeading']);
    doc.byId.etpScopeDetail.hidden = true;
    factory(doc, ['R003', 'R013', 'R022', 'R025'])(result);
    return { detail: doc.byId.etpScopeDetail, host: doc.byId.etpScopeSummary, heading: doc.byId.etpScopeHeading };
  };
}

export function metricMap(host) {
  const out = {};
  const walk = (el) => {
    if (el.className === 'metric' && el.children.length === 2) out[el.children[0].textContent] = el.children[1].textContent;
    el.children.forEach(walk);
  };
  walk(host);
  return out;
}
