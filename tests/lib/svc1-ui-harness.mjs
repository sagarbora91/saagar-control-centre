// Test harness for www/service-stores-ui.js (Service wave 1, group ui).
// A tiny fake DOM (no jsdom), a fake host that records every call, and a fake in-memory core that follows the
// facade contract of plan section 2.13. The REAL UI file is loaded into a vm context.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const UI_PATH = path.join(here, '..', '..', 'www', 'service-stores-ui.js');
export const UI_SOURCE = readFileSync(UI_PATH, 'utf8');

/* ------------------------------------------------------------------ fake DOM */
const VOID = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);
const unesc = (s) => String(s).replace(/&#96;/g, '`').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

function parseAttrs(text) {
  const out = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
  let m;
  while ((m = re.exec(text))) out[m[1]] = m[2] !== undefined ? unesc(m[2]) : (m[3] !== undefined ? unesc(m[3]) : '');
  return out;
}

class El {
  constructor(doc, tag) {
    this.ownerDocument = doc;
    this.tagName = String(tag).toUpperCase();
    this.attrs = {};
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = [];
    this._value = '';
    this._checked = false;
    this._html = '';
    this._text = null;
    this.style = { props: {}, setProperty(k, v) { this.props[k] = v; } };
  }
  get tag() { return this.tagName.toLowerCase(); }
  get children() { return this.childNodes.filter((c) => c instanceof El); }
  get id() { return this.attrs.id || ''; }
  set id(v) { this.attrs.id = String(v); }
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = String(v); }
  get classList() { const self = this; return { contains: (c) => (self.attrs.class || '').split(/\s+/).indexOf(c) >= 0 }; }
  get type() {
    if (this.attrs.type) return this.attrs.type;
    if (this.tag === 'select') return 'select-one';
    if (this.tag === 'textarea') return 'textarea';
    return this.tag === 'input' ? 'text' : (this.tag === 'button' ? 'submit' : '');
  }
  get disabled() { return this.attrs.disabled !== undefined; }
  set disabled(v) { if (v) this.attrs.disabled = ''; else delete this.attrs.disabled; }
  get checked() { return this._checked; }
  set checked(v) { this._checked = !!v; }
  get value() {
    if (this.tag === 'select') {
      const opts = this.descendants().filter((e) => e.tag === 'option');
      const sel = opts.find((o) => o.attrs.selected !== undefined) || opts[0];
      return this._valueSet !== undefined ? this._valueSet : (sel ? (sel.attrs.value !== undefined ? sel.attrs.value : sel.textContent) : '');
    }
    return this._value;
  }
  set value(v) { if (this.tag === 'select') this._valueSet = String(v); else this._value = String(v); }
  get textContent() {
    if (this._text !== null) return this._text;
    return this.childNodes.map((c) => (c instanceof El ? c.textContent : c.text)).join('');
  }
  set textContent(v) { this.childNodes = []; this._text = String(v); }
  get innerHTML() { return this.childNodes.map(serialize).join(''); }
  get outerHTML() { return serialize(this); }
  set innerHTML(html) {
    this.ownerDocument.rawHtml.push(String(html));
    this._html = String(html);
    this._text = null;
    this.childNodes = [];
    parseInto(this, this._html);
  }
  descendants() {
    const out = [];
    const walk = (n) => { for (const c of n.childNodes) { if (c instanceof El) { out.push(c); walk(c); } } };
    walk(this);
    return out;
  }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'value') this._value = String(v); }
  getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.push(c); return c; }
  insertBefore(c, ref) {
    if (c.parentNode) c.parentNode.removeChild(c);
    c.parentNode = this;
    const i = this.childNodes.indexOf(ref);
    if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c);
    return c;
  }
  removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c; }
  addEventListener(type, fn, capture) { this.listeners.push({ type, fn, capture: capture === true }); }
  removeEventListener(type, fn, capture) {
    const i = this.listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === (capture === true));
    if (i >= 0) this.listeners.splice(i, 1);
  }
  focus() { this.ownerDocument.activeElement = this; this.ownerDocument.focusLog.push(this); }
  scrollIntoView() { this.ownerDocument.scrolled.push(this); }
  matches(sel) { return sel.split(',').some((part) => matchSimple(this, part.trim())); }
  closest(sel) { let n = this; while (n && n instanceof El) { if (n.matches(sel)) return n; n = n.parentNode; } return null; }
  querySelectorAll(sel) { return this.descendants().filter((e) => e.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

function matchSimple(el, sel) {
  if (!sel) return false;
  const re = /(#[-\w]+)|(\.[-\w]+)|(\[[^\]]+\])|([a-zA-Z][-\w]*)/g;
  let m;
  let used = 0;
  while ((m = re.exec(sel))) {
    used += m[0].length;
    if (m[1]) { if (el.id !== m[1].slice(1)) return false; } else if (m[2]) {
      if ((el.attrs.class || '').split(/\s+/).indexOf(m[2].slice(1)) < 0) return false;
    } else if (m[3]) {
      const am = /^\[([-\w:]+)(?:="([^"]*)")?\]$/.exec(m[3]);
      if (!am) return false;
      if (el.attrs[am[1]] === undefined) return false;
      if (am[2] !== undefined && el.attrs[am[1]] !== am[2]) return false;
    } else if (m[4]) { if (el.tag !== m[4].toLowerCase()) return false; }
  }
  return used === sel.length;
}

const escText = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (v) => escText(v).replace(/"/g, '&quot;');
function serialize(n) {
  if (!(n instanceof El)) return escText(n.text);
  const attrs = Object.keys(n.attrs).map((k) => ' ' + k + (n.attrs[k] === '' ? '' : '="' + escAttr(k === 'value' ? n._value : n.attrs[k]) + '"')).join('');
  if (VOID.has(n.tag)) return '<' + n.tag + attrs + '>';
  const inner = n.tag === 'textarea' ? escText(n._value) : (n._text !== null ? escText(n._text) : n.childNodes.map(serialize).join(''));
  return '<' + n.tag + attrs + '>' + inner + '</' + n.tag + '>';
}

function parseInto(container, html) {
  const doc = container.ownerDocument;
  const stack = [container];
  const re = /<(\/?)([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) {
      const txt = unesc(m[5]);
      if (top.tag === 'textarea') { top._value += txt; continue; }
      top.childNodes.push({ text: txt, parentNode: top });
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (closing) {
      for (let i = stack.length - 1; i > 0; i--) { if (stack[i].tag === tag) { stack.length = i; break; } }
      continue;
    }
    const el = new El(doc, tag);
    el.attrs = parseAttrs(m[3]);
    if (el.attrs.value !== undefined) el._value = el.attrs.value;
    if (el.attrs.checked !== undefined) el._checked = true;
    el.parentNode = top;
    top.childNodes.push(el);
    if (!VOID.has(tag) && m[4] !== '/') stack.push(el);
  }
}

export function makeDocument() {
  const doc = {
    rawHtml: [],
    focusLog: [],
    scrolled: [],
    activeElement: null,
    listeners: [],
    defaultView: { visualViewport: null, showViewCalls: [], showView(id) { this.showViewCalls.push(id); } },
    createElement(tag) { return new El(doc, tag); },
    addEventListener(type, fn, capture) { doc.listeners.push({ type, fn, capture: capture === true }); },
    removeEventListener(type, fn, capture) {
      const i = doc.listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === (capture === true));
      if (i >= 0) doc.listeners.splice(i, 1);
    },
    querySelector(sel) { return doc.documentElement.querySelector(sel); },
    getElementById(id) { return doc.documentElement.querySelector('#' + id); }
  };
  doc.documentElement = new El(doc, 'html');
  doc.body = new El(doc, 'body');
  doc.documentElement.appendChild(doc.body);
  doc.parentNode = null;
  return doc;
}

export function makeEvent(type, target, props) {
  const ev = Object.assign({
    type, target, key: '', keyCode: 0, shiftKey: false, defaultPrevented: false, stopped: false, immediateStopped: false
  }, props || {});
  ev.preventDefault = () => { ev.defaultPrevented = true; };
  ev.stopPropagation = () => { ev.stopped = true; };
  ev.stopImmediatePropagation = () => { ev.stopped = true; ev.immediateStopped = true; };
  return ev;
}

/* capture listeners on the document first, then bubble from the target up to the document */
export function fire(doc, target, type, props) {
  const ev = makeEvent(type, target, props);
  for (const l of doc.listeners.slice()) {
    if (l.type === type && l.capture && !ev.stopped) l.fn(ev);
  }
  if (ev.stopped) return ev;
  let n = target;
  while (n && !ev.stopped) {
    const list = n.listeners ? n.listeners.slice() : [];
    for (const l of list) { if (l.type === type && !l.capture && !ev.immediateStopped) l.fn(ev); }
    n = n.parentNode;
  }
  if (!ev.stopped) {
    for (const l of doc.listeners.slice()) { if (l.type === type && !l.capture && !ev.stopped) l.fn(ev); }
  }
  return ev;
}

export async function flush() {
  for (let i = 0; i < 25; i++) await Promise.resolve();
  await new Promise((r) => setImmediate(r));
  for (let i = 0; i < 25; i++) await Promise.resolve();
}

/* ------------------------------------------------------------------ sessions */
export const SESS = {
  owner: Object.freeze({ ok: true, isOwner: true, isManager: true, role: 'Store Manager', tier: 'owner', actorName: 'Test Owner' }),
  manager: Object.freeze({ ok: true, isOwner: false, isManager: true, role: 'Store Manager', tier: 'manager', actorName: 'Test Manager' }),
  staff: Object.freeze({ ok: true, isOwner: false, isManager: false, role: 'Cashier', tier: 'staff', actorName: 'Test Cashier' }),
  tech: Object.freeze({ ok: true, isOwner: false, isManager: false, role: 'Technician', tier: 'staff', actorName: 'Test Tech' }),
  none: Object.freeze({ ok: false, isOwner: false, isManager: false, role: '', tier: 'none', actorName: '' })
};

/* ------------------------------------------------------------------ fake core */
export function samplePart(code, extra) {
  return Object.assign({
    code, name: 'Part ' + code, group: 'Glass', unit: 'pc', hsn: '9114', gstRateBp: 1800, sellPricePaise: 15000, priceIncludesTax: false,
    reorderLevel: 2, reorderQty: 5, bin: 'A1', flags: { counterSaleable: true, warrantyClaimable: false }, active: true,
    onHand: 10, valuePaise: 50000, openingSet: true, lastCostPaise: 5000, taxPending: false, rev: 1
  }, extra || {});
}

export function makeCore(opts) {
  const o = opts || {};
  const st = {
    parts: o.parts || [samplePart('DIL-0005', { onHand: 12 }), samplePart('CLP-0009', { onHand: 1, reorderLevel: 3 }), samplePart('GLS-0001', { onHand: 0, openingSet: false })],
    jobs: {},
    receipts: [],
    counterSales: [],
    adjustments: [],
    openings: [],
    oldParts: [],
    movementSeq: 100,
    config: { adjustLimitPaise: 0, storeRoles: [] },
    status: { ok: true, ready: true, blocked: false, problems: [], watermark: null, integrity: { ok: true, lastEntryAt: '2026-11-12T10:00:00.000Z' }, fy: 'FY2026-27', openingSetCount: 2 }
  };
  const calls = [];
  const forced = {};
  const ledgerRows = o.ledgerRows || [];
  const core = {
    calls, state: st, forced,
    names() { return calls.map((c) => c.name); },
    last(name) { for (let i = calls.length - 1; i >= 0; i--) if (calls[i].name === name) return calls[i]; return null; },
    count(name) { return calls.filter((c) => c.name === name).length; }
  };
  const def = (name, fn) => {
    core[name] = function (...args) {
      calls.push({ name, args: JSON.parse(JSON.stringify(args.map((a) => (a === undefined ? null : a)))) });
      if (forced[name]) { const f = forced[name]; return typeof f === 'function' ? f(...args) : f; }
      return fn(...args);
    };
  };
  const costless = (ctx) => !(ctx && ctx.session && (ctx.session.tier === 'owner' || ctx.session.tier === 'manager'));
  def('status', () => JSON.parse(JSON.stringify(st.status)));
  def('reopen', () => ({ ok: true }));
  def('settings', () => ({ ok: true, config: JSON.parse(JSON.stringify(st.config)) }));
  def('setConfig', (patch) => { st.config = Object.assign({}, st.config, patch); return { ok: true }; });
  def('acknowledgeRestore', () => ({ ok: true }));
  def('listParts', (q, ctx) => {
    let rows = st.parts.filter((p) => (q.active === 'all' ? true : (q.active === 'false' ? !p.active : p.active)));
    const text = String(q.text || '').toLowerCase();
    if (text) rows = rows.filter((p) => p.code.toLowerCase().includes(text) || p.name.toLowerCase().includes(text));
    if (q.group) rows = rows.filter((p) => p.group === q.group);
    if (q.state === 'low') rows = rows.filter((p) => p.reorderLevel > 0 && p.onHand <= p.reorderLevel);
    const total = rows.length;
    const page = rows.slice(q.offset || 0, (q.offset || 0) + (q.limit || 25)).map((p) => {
      const r = JSON.parse(JSON.stringify(p));
      if (costless(ctx)) { r.valuePaise = null; r.lastCostPaise = null; }
      return r;
    });
    const pieces = rows.reduce((a, p) => a + p.onHand, 0);
    return { ok: true, rows: page, total, groups: Array.from(new Set(st.parts.map((p) => p.group))), totals: { parts: total, pieces, valuePaise: costless(ctx) ? null : rows.reduce((a, p) => a + p.valuePaise, 0) } };
  });
  def('ledger', (code, q) => ({ ok: true, part: { code, name: 'Part ' + code }, onHand: 12, valuePaise: 60000, rows: ledgerRows, total: ledgerRows.length }));
  def('receiveGoods', (p) => {
    if (st.receipts.some((r) => r.supplierInvoiceNo === p.supplierInvoiceNo)) return { ok: false, code: 'DUPLICATE_SUPPLIER_INVOICE' };
    const no = 'GRN/26-27/' + String(st.receipts.length + 1).padStart(4, '0');
    const pieces = p.lines.reduce((a, l) => a + l.qtyReceived, 0);
    const value = p.lines.reduce((a, l) => a + l.qtyReceived * l.unitCostPaise, 0);
    const doc = { no, supplierName: p.supplierName, supplierInvoiceNo: p.supplierInvoiceNo, supplierInvoiceDate: p.supplierInvoiceDate, docDate: '2026-11-13', lineCount: p.lines.length, pieces, valuePaise: value, status: 'POSTED', lines: p.lines.map((l) => Object.assign({ qtyShort: l.qtyInvoiced ? l.qtyInvoiced - l.qtyReceived : 0 }, l)) };
    st.receipts.push(doc);
    return { ok: true, doc };
  });
  def('listReceipts', (q) => ({ ok: true, rows: st.receipts.slice((q.offset || 0), (q.offset || 0) + (q.limit || 20)), total: st.receipts.length }));
  def('getDoc', (no) => { const d = st.receipts.find((r) => r.no === no); return d ? { ok: true, doc: d } : { ok: false, code: 'DOC_NOT_FOUND' }; });
  def('reverseDoc', (no) => { const d = st.receipts.find((r) => r.no === no); if (d) d.status = 'REVERSED'; return { ok: true }; });
  def('jobParts', (jobId) => {
    const rows = [];
    for (const it of (st.jobs[jobId] || [])) {
      let row = rows.find((r) => r.partCode === it.partCode);
      if (!row) { row = { partCode: it.partCode, name: 'Part ' + it.partCode, issued: 0, returned: 0, net: 0, valuePaise: 5000, lastAt: '2026-11-13T05:00:00.000Z', issues: [] }; rows.push(row); }
      row.issued += it.qty; row.returned += it.returned; row.net += it.qty - it.returned;
      row.issues.push({ movementId: it.movementId, docNo: it.docNo, lineNo: 1, qty: it.qty, outstanding: it.qty - it.returned });
    }
    return { ok: true, rows, totalNet: rows.reduce((a, r) => a + r.net, 0), totalValuePaise: 5000 };
  });
  def('jobHasParts', (jobId) => ({ ok: true, has: (st.jobs[jobId] || []).some((i) => i.qty - i.returned > 0) }));
  def('issueToJob', (p) => {
    const line = p.lines[0];
    const part = st.parts.find((x) => x.code === line.partCode);
    if (!part) return { ok: false, code: 'PART_UNKNOWN' };
    if (part.onHand < line.qty && !line.allowNegative) return { ok: false, code: 'INSUFFICIENT_STOCK', detail: { onHand: part.onHand } };
    part.onHand -= line.qty;
    st.movementSeq += 1;
    (st.jobs[p.jobId] = st.jobs[p.jobId] || []).push({ partCode: line.partCode, qty: line.qty, returned: 0, movementId: 'MOV-' + st.movementSeq, docNo: 'ISS/26-27/' + st.movementSeq });
    return { ok: true };
  });
  def('returnFromJob', (p) => {
    const line = p.lines[0];
    for (const list of Object.values(st.jobs)) {
      const it = list.find((x) => x.movementId === line.issueMovementId);
      if (it) {
        if (line.qty > it.qty - it.returned) return { ok: false, code: 'RETURN_EXCEEDS_ISSUE' };
        it.returned += line.qty;
        st.parts.find((x) => x.code === it.partCode).onHand += line.qty;
        return { ok: true };
      }
    }
    return { ok: false, code: 'ISSUE_LINE_NOT_FOUND' };
  });
  def('counterSale', (p) => {
    const l = p.lines[0];
    const part = st.parts.find((x) => x.code === l.partCode);
    if (part.onHand < l.qty) return { ok: false, code: 'INSUFFICIENT_STOCK', detail: { onHand: part.onHand } };
    part.onHand -= l.qty;
    const no = 'CSL/26-27/' + String(st.counterSales.length + 1).padStart(4, '0');
    st.counterSales.push({ no, at: '2026-11-13T05:00:00.000Z', payMode: p.payMode, by: 'x', lines: p.lines, reversed: false });
    return { ok: true, doc: { no } };
  });
  def('listCounterSales', () => ({ ok: true, rows: st.counterSales }));
  def('proposeAdjustment', (p) => {
    const id = 'DOC-' + String(st.adjustments.length + 1).padStart(6, '0');
    st.adjustments.push({ id, state: 'PROPOSED', at: '2026-11-13T05:00:00.000Z', by: 'Test Manager', note: p.note, lines: p.lines, valuePaise: 5000 });
    return { ok: true, proposalId: id, valuePaise: 5000, needsOwner: true };
  });
  def('listAdjustments', (q) => ({ ok: true, rows: st.adjustments.filter((a) => q.state === 'all' || a.state === 'PROPOSED') }));
  def('approveAdjustment', (id) => { const a = st.adjustments.find((x) => x.id === id); if (!a) return { ok: false, code: 'DOC_NOT_FOUND' }; a.state = 'POSTED'; a.docNo = 'ADJ/26-27/0001'; return { ok: true }; });
  def('rejectAdjustment', (id) => { const a = st.adjustments.find((x) => x.id === id); a.state = 'REJECTED'; return { ok: true }; });
  def('withdrawAdjustment', (id) => { const a = st.adjustments.find((x) => x.id === id); a.state = 'WITHDRAWN'; return { ok: true }; });
  def('listOpening', () => ({ ok: true, rows: st.openings }));
  def('proposeOpening', (p) => { const id = 'DOC-' + String(500 + st.openings.length); st.openings.push({ id, state: 'PROPOSED', at: '2026-11-13T05:00:00.000Z', by: 'Test Manager', lines: p.lines }); return { ok: true, proposalId: id }; });
  def('approveOpening', (id) => { const p = st.openings.find((x) => x.id === id); if (!p) return { ok: false, code: 'DOC_NOT_FOUND' }; p.state = 'POSTED'; for (const l of p.lines) { const part = st.parts.find((x) => x.code === l.partCode); part.openingSet = true; part.onHand += l.qty; } return { ok: true }; });
  def('rejectOpening', (id) => { st.openings.find((x) => x.id === id).state = 'REJECTED'; return { ok: true }; });
  def('withdrawOpening', (id) => { st.openings.find((x) => x.id === id).state = 'WITHDRAWN'; return { ok: true }; });
  def('listOldParts', () => ({ ok: true, rows: st.oldParts }));
  def('registerOldPart', (p) => { const no = 'OLD/26-27/' + String(st.oldParts.length + 1).padStart(4, '0'); st.oldParts.push(Object.assign({ no, at: '2026-11-13T05:00:00.000Z' }, p)); return { ok: true, row: { no } }; });
  def('oldPartNextStates', (s) => ({ ok: true, states: s === 'HELD_FOR_CLAIM' ? ['CUSTOMER_RETURNED', 'SCRAP_PENDING'] : (s === 'SCRAP_PENDING' ? ['HELD_FOR_CLAIM', 'CUSTOMER_RETURNED'] : []) }));
  def('moveOldPart', (no, m) => { const r = st.oldParts.find((x) => x.no === no); r.state = m.to; if (m.to === 'SCRAP_PENDING') r.scrapMonth = '2026-10'; return { ok: true }; });
  def('signOffScrap', (p) => { for (const n of p.oldNos) st.oldParts.find((x) => x.no === n).state = 'SCRAPPED'; return { ok: true }; });
  def('reorderList', () => ({ ok: true, rows: st.parts.filter((p) => p.reorderLevel > 0 && p.onHand <= p.reorderLevel).map((p) => ({ code: p.code, name: p.name, onHand: p.onHand, reorderLevel: p.reorderLevel, reorderQty: p.reorderQty })) }));
  def('reportData', (type, args) => ({ ok: true, svcData: { type, args, rows: [] } }));
  return core;
}

/* ------------------------------------------------------------------ host + UI loader */
export function loadUi(mastersFake) {
  const doc = makeDocument();
  const sandbox = { document: doc, window: null, console, Promise, Date, Math, JSON, Object, Array, String, Number, RegExp, parseInt, parseFloat, isFinite, Error };
  sandbox.window = doc.defaultView;
  if (mastersFake) sandbox.SaagarServiceMastersUi = mastersFake;
  vm.createContext(sandbox);
  vm.runInContext(UI_SOURCE, sandbox, { filename: 'service-stores-ui.js' });
  return { sandbox, doc, ui: sandbox.SaagarServiceStoresUI };
}

export function makeHost(doc, opts) {
  const o = opts || {};
  const view = new El(doc, 'div');
  view.attrs = { class: 'view active', id: 'view-stores' };
  const root = new El(doc, 'div');
  root.attrs = { id: 'svs-root', class: 'svs-wrap' };
  view.appendChild(root);
  const formView = new El(doc, 'div');
  formView.attrs = { class: 'view active', id: 'view-form' };
  const jobHost = new El(doc, 'div');
  jobHost.attrs = { id: 'svs-job-host', class: 'svs-job-host' };
  formView.appendChild(jobHost);
  const header = new El(doc, 'div');
  header.attrs = { class: 'header-right' };
  const newBtn = new El(doc, 'button');
  newBtn.attrs = { 'data-action': 'new-service-order', class: 'btn btn-primary' };
  header.appendChild(newBtn);
  doc.body.appendChild(header);
  doc.body.appendChild(view);
  doc.body.appendChild(formView);

  const calls = { toast: [], reauth: [], report: [], showCases: 0, job: [] };
  const h = {
    el: { view, root, formView, jobHost, newBtn, header },
    calls,
    session: o.session || SESS.owner,
    past: false,
    reauthResult: true,
    jobs: o.jobs || { 'WS-2026-001': { id: 'WS-2026-001', status: 'open', label: 'WS-2026-001 Titan Edge', invoiceNo: '', locked: false, paymentStatus: 'cash' } },
    currentJob: 'WS-2026-001',
    core: o.core === undefined ? makeCore() : o.core,
    reportApi: o.report === undefined ? { preview(type, opts2) { calls.report.push({ type, opts: opts2 }); } } : o.report,
    now: '2026-11-13T05:30:00.000Z',
    today: '2026-11-13'
  };
  h.host = {
    root, jobHost,
    session: () => (typeof h.session === 'function' ? h.session() : h.session),
    reauth: (label) => { calls.reauth.push(label); return typeof h.reauthResult === 'function' ? h.reauthResult(label) : Promise.resolve(h.reauthResult); },
    isPast: () => h.past,
    viewDate: () => h.today,
    today: () => h.today,
    nowIso: () => h.now,
    toast: (m) => calls.toast.push(m),
    job: (id) => { calls.job.push(id); return h.jobs[id] ? JSON.parse(JSON.stringify(h.jobs[id])) : null; },
    currentJobId: () => h.currentJob,
    jobIds: () => Object.keys(h.jobs),
    showCases: () => { calls.showCases += 1; },
    core: () => h.core,
    report: () => h.reportApi
  };
  return h;
}

export function setup(opts) {
  const o = opts || {};
  const { sandbox, doc, ui } = loadUi(o.masters);
  const h = makeHost(doc, o);
  const api = {
    doc, ui, h, host: h.host, core: h.core, sandbox,
    mount() { return ui.mount(h.host); },
    async show() { ui.show(); await flush(); },
    rootHtml() { return h.el.root.innerHTML; },
    layerHtml() { const l = doc.body.childNodes.find((c) => c instanceof El && c.id === 'svs-layer'); return l ? l.innerHTML : ''; },
    layer() { return doc.body.childNodes.find((c) => c instanceof El && c.id === 'svs-layer') || null; },
    jobHtml() { return h.el.jobHost.innerHTML; },
    /* find a control by its action id (and optional key) in root, layer or job host */
    find(action, key) {
      const where = [h.el.root, api.layer(), h.el.jobHost, h.el.header];
      for (const w of where) {
        if (!w) continue;
        const hit = w.querySelectorAll('[data-svcs-action="' + action + '"]').find((e) => key === undefined || e.getAttribute('data-svs-key') === String(key));
        if (hit) return hit;
      }
      return null;
    },
    async click(action, key) {
      const el = api.find(action, key);
      if (!el) throw new Error('no control ' + action + (key !== undefined ? ' key ' + key : ''));
      const ev = fire(doc, el, 'click');
      await flush();
      return ev;
    },
    field(name, scope, line) {
      const roots = [scope || null, api.layer(), h.el.root, h.el.jobHost].filter(Boolean);
      for (const w of roots) {
        const hits = w.querySelectorAll('[data-svs-field="' + name + '"]').filter((e) => line === undefined || e.getAttribute('data-svs-line') === String(line));
        if (hits.length) return hits[0];
      }
      return null;
    },
    async type(name, value, scope, line) {
      const el = api.field(name, scope, line);
      if (!el) throw new Error('no field ' + name);
      el.value = value;
      fire(doc, el, 'input');
      await flush();
      return el;
    },
    async setSelect(name, value, scope, line) {
      const el = api.field(name, scope, line);
      if (!el) throw new Error('no select ' + name);
      el.value = value;
      fire(doc, el, 'change');
      await flush();
      return el;
    },
    async key(el, key, props) { const ev = fire(doc, el, 'keydown', Object.assign({ key }, props || {})); await flush(); return ev; },
    actionsIn(html) { return Array.from(html.matchAll(/data-svcs-action="([^"]+)"/g)).map((m) => m[1]); }
  };
  return api;
}

export { El };
