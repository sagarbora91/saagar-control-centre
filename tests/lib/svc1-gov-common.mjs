// tests/lib/svc1-gov-common.mjs
// Shared helpers for the Service wave 1 governance tests (tests/svc1-gov-*.test.mjs).
// SVC1_GOV_ROOT may point at another copy of the repo (used only to prove the tests themselves work).
// Nothing here opens an audit-secrets folder, anything under E:\ETP, or the Phase 5 firebase exception note.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(process.env.SVC1_GOV_ROOT || path.join(HERE, '..', '..'));
export const TEST_ROOT = path.resolve(HERE, '..', '..');
export const WORKSPACE = process.env.SVC_W1_WORKSPACE || 'E:\\Projects\\Saagar Control Centre Workspace\\service-wave-1';

export const FORBIDDEN_NOTE = 'verification/audit/PHASE-5-FIREBASE-API23-PHYSICAL-CATALOG-EXCEPTION-2026-08-24.md';

// The seven files of the wave, in the load order of the Service page.
export const SEVEN = Object.freeze([
  { key: 'store', file: 'www/service-stores-store.js', global: 'SaagarServiceStoresStore', pure: true },
  { key: 'fifo', file: 'www/service-stores-fifo.js', global: 'SaagarServiceStoresFifo', pure: true },
  { key: 'masters', file: 'www/service-stores-masters.js', global: 'SaagarServiceMasters', pure: true },
  { key: 'docs', file: 'www/service-stores-docs.js', global: 'SaagarServiceStoresDocs', pure: true },
  { key: 'core', file: 'www/service-stores-core.js', global: 'SaagarServiceStoresCore', pure: true },
  { key: 'mui', file: 'www/service-stores-masters-ui.js', global: 'SaagarServiceMastersUi', pure: false },
  { key: 'ui', file: 'www/service-stores-ui.js', global: 'SaagarServiceStoresUI', pure: false }
]);
export const PURE = SEVEN.filter((f) => f.pure);
export const SCREEN = SEVEN.filter((f) => !f.pure);
export const UI_FILES = SCREEN.map((f) => f.file);

export const abs = (rel) => path.join(REPO, ...rel.split('/'));
export const exists = (rel) => fs.existsSync(abs(rel));
export const readBuf = (rel) => fs.readFileSync(abs(rel));
export const readText = (rel) => fs.readFileSync(abs(rel), 'utf8');
export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
export const sizeOf = (rel) => fs.statSync(abs(rel)).size;
export const workspaceExists = () => { try { return fs.statSync(WORKSPACE).isDirectory(); } catch { return false; } };

// The test code lives in the real repo even when SVC1_GOV_ROOT points elsewhere; fixtures follow the test code.
export function loadJson(fixtureName) {
  const p = path.join(TEST_ROOT, 'tests', 'fixtures', 'service-wave-1', fixtureName);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
export function fixtureBuf(fixtureName) {
  return fs.readFileSync(path.join(TEST_ROOT, 'tests', 'fixtures', 'service-wave-1', fixtureName));
}

export function listFiles(dirRel, pred) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(REPO, ...d.split('/')), { withFileTypes: true })) {
      // never descend into a secrets folder or node_modules (gov-audit hardening; no such folder exists today)
      if (e.isDirectory() && /audit-secrets|^node_modules$/i.test(e.name)) continue;
      const rel = d + '/' + e.name;
      if (e.isDirectory()) walk(rel); else if (!pred || pred(rel)) out.push(rel);
    }
  };
  walk(dirRel);
  return out;
}

// ---------- babel ----------
let babel = null;
export function babelParser() {
  if (!babel) babel = require('@babel/parser');
  return babel;
}
export function parseScript(src, { recover = false } = {}) {
  return babelParser().parse(src, { sourceType: 'script', ranges: true, tokens: false, errorRecovery: recover, allowReturnOutsideFunction: true });
}
export function walk(node, visit, parents = []) {
  if (!node || typeof node.type !== 'string') return;
  if (visit(node, parents) === false) return;
  parents.push(node);
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'range' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments' || k === 'extra') continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, visit, parents); }
    else if (v && typeof v.type === 'string') walk(v, visit, parents);
  }
  parents.pop();
}
export function sourceOf(src, node) { return src.slice(node.start, node.end); }

// ---------- vm loading of a UMD file ----------
export function loadUmd(rel, extraGlobals = {}) {
  const src = readText(rel);
  const box = vm.createContext(Object.assign({ console }, extraGlobals));
  box.globalThis = box;
  vm.runInContext(src, box, { filename: rel });
  return box;
}
export function loadApi(entry, extraGlobals) {
  if (!exists(entry.file)) return null;
  const box = loadUmd(entry.file, extraGlobals);
  return box[entry.global] || null;
}

// ---------- sessions ----------
// The real SaagarModuleRuntime.session() (www/shared/module-runtime.js) run in a vm with a stub shell.
// `read` is one of the S15 table entries (value of SaagarOwnerSession.read()); undefined = no shell API; 'THROW' = read() throws.
const RUNTIME_SRC = fs.readFileSync(path.join(TEST_ROOT, 'www', 'shared', 'module-runtime.js'), 'utf8');
export function realSession(read, { ownerName = 'Test Owner', staffName = 'Test Staff' } = {}) {
  const ctx = { console, location: { origin: 'http://localhost' }, document: {}, addEventListener() {} };
  ctx.window = ctx; ctx.parent = ctx;
  if (read !== undefined) ctx.SaagarOwnerSession = { read() { if (read === 'THROW') throw new Error('shell read failed'); return read; } };
  ctx.ownerName = () => ownerName;
  ctx.activeStaff = () => ({ name: staffName });
  vm.createContext(ctx);
  vm.runInContext(RUNTIME_SRC, ctx);
  const s = ctx.SaagarModuleRuntime.session();
  return JSON.parse(JSON.stringify(s));
}

// ---------- code stripping ----------
// Text of the program with comments blanked (same length, newlines kept).
export function blankComments(src) {
  const ast = babelParser().parse(src, { sourceType: 'script', errorRecovery: true, allowReturnOutsideFunction: true, tokens: false });
  let out = src;
  for (const c of ast.comments || []) {
    const chunk = src.slice(c.start, c.end).replace(/[^\n]/g, ' ');
    out = out.slice(0, c.start) + chunk + out.slice(c.end);
  }
  return out;
}

export function stringValues(ast) {
  const out = [];
  walk(ast, (n) => {
    if (n.type === 'StringLiteral') out.push(n.value);
    else if (n.type === 'TemplateElement') out.push(n.value.cooked == null ? n.value.raw : n.value.cooked);
  });
  return out;
}

export function frequency(list) {
  const m = {};
  for (const x of list) m[x] = (m[x] || 0) + 1;
  return Object.fromEntries(Object.keys(m).sort().map((k) => [k, m[k]]));
}

export function bytesIssues(rel) {
  const buf = readBuf(rel);
  const issues = [];
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) issues.push('BOM');
  if (buf.includes(0x0d)) issues.push('CR');
  if (buf.length === 0 || buf[buf.length - 1] !== 0x0a) issues.push('no final newline');
  else if (buf.length > 1 && buf[buf.length - 2] === 0x0a) issues.push('more than one final newline');
  return issues;
}

export function missingFilesMessage(rels) {
  const missing = rels.filter((r) => !exists(r));
  return missing.length ? 'waiting on writers, file not there yet: ' + missing.join(', ') : '';
}

// ---------- action ids in a screen file ----------
// An action id is written as data-svcs-action="id", as the first argument of a function whose name contains "action",
// as setAttribute('data-svcs-action', 'id'), as the value of an `action:` property, or it is a dispatch label:
// a switch case, a string key of an object, or one side of an == / === comparison.
export const ACTION_ID = /^(svs|svcm)-[a-z0-9]+(-[a-z0-9]+)*$/;
export function extractActionIds(src) {
  const ast = parseScript(src);
  const markup = new Set();
  const dispatch = new Set();
  const dynamic = [];
  const bad = [];
  const fnNameOf = (parents) => {
    for (let i = parents.length - 1; i >= 0; i--) {
      const p = parents[i];
      if (p.type === 'FunctionDeclaration' && p.id) return p.id.name;
      if (p.type === 'FunctionExpression' || p.type === 'ArrowFunctionExpression') {
        const q = parents[i - 1];
        if (q && q.type === 'VariableDeclarator' && q.id.type === 'Identifier') return q.id.name;
        if (q && q.type === 'ObjectProperty' && q.key) return q.key.name || String(q.key.value || '');
        if (q && q.type === 'AssignmentExpression' && q.left.type === 'MemberExpression' && q.left.property) return q.left.property.name || '';
      }
      if (p.type === 'ObjectMethod' && p.key) return p.key.name || '';
    }
    return '';
  };
  // gov-audit: a builder such as btn(action, label) or partResultsHtml(rows, action) writes data-svcs-action="' + attr(action) + '".
  // Such a function is an action helper; a call to it with a literal id at that parameter position is a rendered control.
  const helpers = Object.create(null);
  const nearestFn = (parents) => { for (let i = parents.length - 1; i >= 0; i--) if (/Function/.test(parents[i].type)) return parents[i]; return null; };
  walk(ast, (n, parents) => {
    if (n.type !== 'StringLiteral' && n.type !== 'TemplateElement') return;
    const text = n.type === 'StringLiteral' ? n.value : (n.value.cooked == null ? n.value.raw : n.value.cooked);
    if (!/data-svcs-action\s*=\s*\\?["']$/.test(text)) return;
    const after = src.slice(n.end, n.end + 80);
    const m = /^\s*(?:\+|\}\s*)?\s*(?:\$\{)?\s*(?:attr|esc)?\(?\s*([A-Za-z_$][\w$]*)\s*\)?/.exec(after);
    const fnNode = nearestFn(parents);
    const name = fnNameOf(parents);
    if (m && fnNode && fnNode.params) {
      const idx = fnNode.params.findIndex((p) => p.type === 'Identifier' && p.name === m[1]);
      if (idx >= 0 && name) helpers[name] = idx;
    }
  });
  walk(ast, (n, parents) => {
    let text = null;
    if (n.type === 'StringLiteral') text = n.value;
    else if (n.type === 'TemplateElement') text = n.value.cooked == null ? n.value.raw : n.value.cooked;
    if (text !== null && text.indexOf('data-svcs-action') !== -1) {
      // gov-audit fix: the old pattern had `\?` (a literal question mark), so no markup literal was ever matched.
      const re = /data-svcs-action\s*=\s*\\?["']([^"'\\<>\s]*)/g;
      let m;
      while ((m = re.exec(text))) {
        if (m[1] === '') {
          const fname = fnNameOf(parents);
          // allowed: inside an action helper (its parameter is the id), or the value is an `.action` field of a literal table
          const after = src.slice(n.end, n.end + 80);
          const fromActionField = /^\s*\+\s*(?:attr|esc)?\(?\s*[\w$.\[\]]*\.action\s*\)?/.test(after);
          if (!/action/i.test(fname) && !(fname in helpers) && !fromActionField) dynamic.push('dynamic data-svcs-action outside an action helper at ' + n.start);
        }
        else if (ACTION_ID.test(m[1])) markup.add(m[1]);
        else bad.push(m[1]);
      }
    }
    if (n.type === 'CallExpression') {
      const c = n.callee;
      const cname = c.type === 'Identifier' ? c.name : '';
      if (cname && cname in helpers) {
        const a = n.arguments[helpers[cname]];
        if (a && a.type === 'StringLiteral') { if (ACTION_ID.test(a.value)) markup.add(a.value); else bad.push(a.value); }
        if (a && a.type === 'ConditionalExpression') for (const b of [a.consequent, a.alternate]) if (b.type === 'StringLiteral') { if (ACTION_ID.test(b.value)) markup.add(b.value); else bad.push(b.value); }
      }
    }
    if (n.type === 'CallExpression') {
      const c = n.callee;
      const name = c.type === 'Identifier' ? c.name : (c.type === 'MemberExpression' && !c.computed ? c.property.name : '');
      const a0 = n.arguments[0];
      if (name === 'setAttribute' && a0 && a0.type === 'StringLiteral' && a0.value === 'data-svcs-action') {
        const a1 = n.arguments[1];
        if (a1 && a1.type === 'StringLiteral') { if (ACTION_ID.test(a1.value)) markup.add(a1.value); else bad.push(a1.value); }
        else dynamic.push('dynamic setAttribute at ' + n.start);
      } else if (/action/i.test(name) && a0 && a0.type === 'StringLiteral' && ACTION_ID.test(a0.value)) markup.add(a0.value);
    }
    if (n.type === 'ObjectProperty') {
      const k = n.key.type === 'Identifier' ? n.key.name : (n.key.type === 'StringLiteral' ? n.key.value : '');
      if (n.key.type === 'StringLiteral' && ACTION_ID.test(k)) dispatch.add(k);
      if (/^(action|act|dataAction|svcsAction)$/.test(k) && n.value.type === 'StringLiteral' && ACTION_ID.test(n.value.value)) markup.add(n.value.value);
    }
    if (n.type === 'SwitchCase' && n.test && n.test.type === 'StringLiteral' && ACTION_ID.test(n.test.value)) dispatch.add(n.test.value);
    if (n.type === 'BinaryExpression' && /^[=!]==?$/.test(n.operator)) {
      // only a comparison with something called action counts as dispatch (element ids are compared too, e.g. id === 'svs-cs-form')
      const isActionRef = (x) => (x.type === 'Identifier' && /^(action|act|actionId|dataAction)$/.test(x.name)) || (x.type === 'MemberExpression' && !x.computed && /^(action|actionId)$/.test(x.property.name));
      for (const [side, other] of [[n.left, n.right], [n.right, n.left]]) if (side.type === 'StringLiteral' && ACTION_ID.test(side.value) && isActionRef(other)) dispatch.add(side.value);
    }
  });
  return { markup, dispatch, dynamic, bad, all: new Set([...markup, ...dispatch]) };
}

// sample storage keys for a register pattern such as saagar_svcs_ledger_v1_YYYY-MM[_pNN]
export function samplesForPattern(pattern) {
  const base = pattern.replace('YYYY-MM', '2026-11').replace('FYyyyy-yy', 'FY2026-27');
  if (base.endsWith('[_pNN]')) { const b = base.slice(0, -6); return [b, b + '_p2', b + '_p10']; }
  return [base];
}
