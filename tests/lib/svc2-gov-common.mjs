// tests/lib/svc2-gov-common.mjs
// Shared helpers for the Service wave 2 governance tests (tests/svc2-gov-*.test.mjs).
// SVC2_GOV_ROOT may point at another copy of the repo (used only to prove the tests themselves work).
// Pure helpers of the Phase 1 governance library are imported by path and never edited; everything that depends on the repo root is re-made here.
// Nothing here opens an audit-secrets folder, anything under E:\ETP, or the Phase 5 firebase exception note.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  parseScript, walk, sourceOf, blankComments, stringValues, frequency, babelParser, realSession
} from './svc1-gov-common.mjs';

export { parseScript, walk, sourceOf, blankComments, stringValues, frequency, babelParser, realSession };

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(process.env.SVC2_GOV_ROOT || path.join(HERE, '..', '..'));
export const TEST_ROOT = path.resolve(HERE, '..', '..');
export const WORKSPACE = process.env.SVC_W2_WORKSPACE || 'E:\\Projects\\Saagar Control Centre Workspace\\service-wave-2';
export const G0_COMMIT = '031841f';
export const FORBIDDEN_NOTE = 'verification/audit/PHASE-5-FIREBASE-API23-PHYSICAL-CATALOG-EXCEPTION-2026-08-24.md';

// The seven Phase 1 files (unchanged names), then the seven Phase 2 files in the load order of the Service page (plan 2.1).
export const PHASE1 = Object.freeze([
  { key: 'store', file: 'www/service-stores-store.js', global: 'SaagarServiceStoresStore', pure: true },
  { key: 'fifo', file: 'www/service-stores-fifo.js', global: 'SaagarServiceStoresFifo', pure: true },
  { key: 'masters', file: 'www/service-stores-masters.js', global: 'SaagarServiceMasters', pure: true },
  { key: 'docs', file: 'www/service-stores-docs.js', global: 'SaagarServiceStoresDocs', pure: true },
  { key: 'core', file: 'www/service-stores-core.js', global: 'SaagarServiceStoresCore', pure: true },
  { key: 'mui', file: 'www/service-stores-masters-ui.js', global: 'SaagarServiceMastersUi', pure: false },
  { key: 'ui', file: 'www/service-stores-ui.js', global: 'SaagarServiceStoresUI', pure: false }
]);
// budget = bytes (plan 2.1). Raise only with a written reason in the plan, never here.
export const BILLING = Object.freeze([
  { key: 'calc', file: 'www/service-billing-calc.js', global: 'SaagarServiceBillingCalc', pure: true, stem: 'SBC_', budget: 60000 },
  { key: 'docs', file: 'www/service-billing-docs.js', global: 'SaagarServiceBillingDocs', pure: true, stem: 'SBD_', budget: 120000 },
  { key: 'money', file: 'www/service-billing-money.js', global: 'SaagarServiceBillingMoney', pure: true, stem: 'SBM_', budget: 100000 },
  { key: 'migrate', file: 'www/service-billing-migrate.js', global: 'SaagarServiceBillingMigrate', pure: true, stem: 'SBG_', budget: 50000 },
  { key: 'core', file: 'www/service-billing-core.js', global: 'SaagarServiceBillingCore', pure: true, stem: 'SBX_', budget: 120000 },
  { key: 'ui', file: 'www/service-billing-ui.js', global: 'SaagarServiceBillingUI', pure: false, stem: 'SBU_', budget: 190000 },
  { key: 'area', file: 'www/service-billing-area-ui.js', global: 'SaagarServiceBillingAreaUI', pure: false, stem: 'SBA_', budget: 120000 }
]);
export const BILLING_PURE = BILLING.filter((f) => f.pure);
export const BILLING_SCREEN = BILLING.filter((f) => !f.pure);
export const BILLING_FILES = BILLING.map((f) => f.file);

// The ten report types of plan 2.15 and where each one is listed. module '*' is written '' in shell-search.js.
export const REPORT_TYPES_W2 = Object.freeze([
  { type: 'serviceBillSummary', module: 'service' },
  { type: 'serviceTaxInvoiceV2', module: 'service' },
  { type: 'serviceCreditNote', module: 'service' },
  { type: 'serviceReceipt', module: 'service' },
  { type: 'serviceRefundVoucher', module: 'service' },
  { type: 'serviceWarrantySheet', module: 'service' },
  { type: 'serviceUnbilledIssues', module: 'service' },
  { type: 'serviceDaySummary', module: '*' },
  { type: 'serviceAdvancesHeld', module: '*' },
  { type: 'serviceRevenue', module: '*' }
]);

export const abs = (rel) => path.join(REPO, ...rel.split('/'));
export const exists = (rel) => fs.existsSync(abs(rel));
export const readBuf = (rel) => fs.readFileSync(abs(rel));
export const readText = (rel) => fs.readFileSync(abs(rel), 'utf8');
export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
export const sizeOf = (rel) => fs.statSync(abs(rel)).size;
export const workspaceExists = () => { try { return fs.statSync(WORKSPACE).isDirectory(); } catch { return false; } };

export function fixturePath(name) { return path.join(TEST_ROOT, 'tests', 'fixtures', 'service-wave-2', name); }
export function loadJson(name) { return JSON.parse(fs.readFileSync(fixturePath(name), 'utf8')); }
export function fixtureBuf(name) { return fs.readFileSync(fixturePath(name)); }
export function phase1Json(name) { return JSON.parse(fs.readFileSync(path.join(TEST_ROOT, 'tests', 'fixtures', 'service-wave-1', name), 'utf8')); }
export function phase1Buf(name) { return fs.readFileSync(path.join(TEST_ROOT, 'tests', 'fixtures', 'service-wave-1', name)); }

export function listFiles(dirRel, pred) {
  const out = [];
  const walkDir = (d) => {
    for (const e of fs.readdirSync(path.join(REPO, ...d.split('/')), { withFileTypes: true })) {
      if (e.isDirectory() && /audit-secrets|^node_modules$/i.test(e.name)) continue;
      const rel = d + '/' + e.name;
      if (e.isDirectory()) walkDir(rel); else if (!pred || pred(rel)) out.push(rel);
    }
  };
  walkDir(dirRel);
  return out;
}

// G0 text of a repo file: the workspace copy of the wave start when there is one, else `git show 031841f:<path>` (read only), else null.
export function g0Buffer(rel) {
  const ws = path.join(WORKSPACE, 'g0', 'pre-wave-service2', ...rel.split('/'));
  try { if (fs.existsSync(ws)) return fs.readFileSync(ws); } catch { /* fall through to git */ }
  try { return execFileSync('git', ['-C', TEST_ROOT, 'show', G0_COMMIT + ':' + rel], { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
}
export function gitChangedSinceG0(prefixes) {
  try {
    const out = execFileSync('git', ['-C', TEST_ROOT, 'diff', '--name-only', G0_COMMIT, '--'].concat(prefixes), { maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8');
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch { return null; }
}

// Line diff by longest common subsequence: {removed:[line], added:[line]}.
export function lineDiff(oldText, newText) {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const n = a.length, m = b.length, w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
  const removed = [], added = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; }
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) removed.push(a[i++]);
    else added.push(b[j++]);
  }
  while (i < n) removed.push(a[i++]);
  while (j < m) added.push(b[j++]);
  return { removed, added };
}

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
// Same method as Phase 1 (svc1-gov-common extractActionIds), with the Phase 2 id stem `svb-`.
export const ACTION_ID = /^svb(-[a-z0-9]+)+$/;
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
      const re = /data-svcs-action\s*=\s*\\?["']([^"'\\<>\s]*)/g;
      let m;
      while ((m = re.exec(text))) {
        if (m[1] === '') {
          const fname = fnNameOf(parents);
          const after = src.slice(n.end, n.end + 80);
          const fromActionField = /^\s*\+\s*(?:attr|esc)?\(?\s*[\w$.\[\]]*\.action\s*\)?/.test(after);
          if (!/action/i.test(fname) && !(fname in helpers) && !fromActionField) dynamic.push('dynamic data-svcs-action outside an action helper at ' + n.start);
        } else if (ACTION_ID.test(m[1])) markup.add(m[1]);
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
      const isActionRef = (x) => (x.type === 'Identifier' && /^(action|act|actionId|dataAction)$/.test(x.name)) || (x.type === 'MemberExpression' && !x.computed && /^(action|actionId)$/.test(x.property.name));
      for (const [side, other] of [[n.left, n.right], [n.right, n.left]]) if (side.type === 'StringLiteral' && ACTION_ID.test(side.value) && isActionRef(other)) dispatch.add(side.value);
    }
  });
  return { markup, dispatch, dynamic, bad, all: new Set([...markup, ...dispatch]) };
}

// ---------- dispatch branches and reachability (used by the step-up test and by the register tool) ----------
export const calleeName = (c) => (c.type === 'Identifier' ? c.name : (c.type === 'MemberExpression' && !c.computed ? c.property.name : ''));

export function functionBodies(ast) {
  const fnBodies = Object.create(null);
  const put = (k, b) => { if (k) (fnBodies[k] = fnBodies[k] || []).push(b); };
  walk(ast, (n) => {
    if (n.type === 'FunctionDeclaration' && n.id) put(n.id.name, n.body);
    if (n.type === 'ObjectProperty' && n.value && /Function/.test(n.value.type)) put(n.key.name || n.key.value, n.value.body);
    if (n.type === 'ObjectMethod' && n.key.name) put(n.key.name, n.body);
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && /Function/.test(n.init.type)) put(n.id.name, n.init.body);
    if (n.type === 'AssignmentExpression' && n.right && /Function/.test(n.right.type) && n.left.type === 'MemberExpression' && n.left.property.name) put(n.left.property.name, n.right.body);
  });
  return fnBodies;
}
export function branchesOf(ast, id) {
  const out = [];
  walk(ast, (n, parents) => {
    if (n.type === 'SwitchCase' && n.test && n.test.type === 'StringLiteral' && n.test.value === id) {
      const sw = parents[parents.length - 1];
      let i = sw.cases.indexOf(n);
      while (i < sw.cases.length && sw.cases[i].consequent.length === 0) i += 1;
      if (i < sw.cases.length) out.push({ type: 'BlockStatement', body: sw.cases[i].consequent, start: sw.cases[i].start, end: sw.cases[i].end });
    }
    if (n.type === 'ObjectProperty' && n.key.type === 'StringLiteral' && n.key.value === id) out.push(n.value.body || n.value);
    if (n.type === 'IfStatement' && n.test.type === 'BinaryExpression' && [n.test.left, n.test.right].some((x) => x.type === 'StringLiteral' && x.value === id)) out.push(n.consequent);
  });
  return out;
}
// Does `root` reach a call whose callee name satisfies `want(name)`, following named functions of the same file up to `depth` levels?
export function reachesCall(root, fnBodies, want, seen = new Set(), depth = 0) {
  let found = false;
  walk(root, (n) => {
    if (found) return false;
    if (n.type !== 'CallExpression') return;
    const nm = calleeName(n.callee);
    if (want(nm, n)) { found = true; return false; }
    if (depth < 6 && nm && fnBodies[nm] && !seen.has(nm)) {
      seen.add(nm);
      for (const b of fnBodies[nm]) if (reachesCall(b, fnBodies, want, seen, depth + 1)) { found = true; return false; }
    }
  });
  return found;
}

// A write the screen names through a variable: `call = 'takeReceipt'; ... callB(call, [...])` (A-MIG audit 2026-11-19). The variable must be
// the first argument of an adapter call in the same function body, and the string literal assigned to it is the write's name.
function varWritesIn(node) {
  const vars = new Set();
  const assigned = [];
  walk(node, (n) => {
    if (n.type === 'CallExpression' && ADAPTER_CALLERS.includes(calleeName(n.callee)) && n.arguments[0] && n.arguments[0].type === 'Identifier') vars.add(n.arguments[0].name);
    if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier' && n.right.type === 'StringLiteral') assigned.push([n.left.name, n.right.value]);
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && n.init.type === 'StringLiteral') assigned.push([n.id.name, n.init.value]);
  });
  return assigned.filter(([v]) => vars.has(v)).map(([, w]) => w);
}
function reachesVarWrite(root, fnBodies, w, seen, depth) {
  if (varWritesIn(root).includes(w)) return true;
  let found = false;
  walk(root, (n) => {
    if (found) return false;
    if (n.type !== 'CallExpression') return;
    const nm = calleeName(n.callee);
    if (depth < 6 && nm && fnBodies[nm] && !seen.has(nm)) {
      seen.add(nm);
      for (const b of fnBodies[nm]) if (reachesVarWrite(b, fnBodies, w, seen, depth + 1)) { found = true; return false; }
    }
  });
  return found;
}
// Does a dispatch branch reach the facade write `w`, by its name or through an adapter variable?
export function reachesWrite(root, fnBodies, w) {
  return reachesCall(root, fnBodies, namesCall(w)) || reachesVarWrite(root, fnBodies, w, new Set(), 0);
}

// A call that names a facade method: either the callee is called that, or the UI adapter call(name, args) / bx('name', ...) carries the name as a string argument.
export const ADAPTER_CALLERS = Object.freeze(['callB', 'call', 'asyncB', 'syncB', 'bx']);
export const namesCall = (w) => (nm, node) => nm === w || (ADAPTER_CALLERS.includes(nm) && !!node.arguments[0] && node.arguments[0].type === 'StringLiteral' && node.arguments[0].value === w);

// The write methods of the billing facade (plan 2.9). The UI reaches the facade through an adapter of the same names.
export const FACADE_WRITES = Object.freeze([
  'saveEstimate', 'recordApproval', 'issueBill', 'addCcptNumber', 'cancelBill', 'issueCreditNote', 'takeReceipt', 'takeCounterReceipt',
  'refund', 'reverseReceipt', 'issueNoChargeSheet', 'cancelNoChargeSheet', 'voidJob', 'decideLegacyAdvance', 'setConfig', 'runMigration',
  // Stage E round 2 (A): one Phase 1 return naming the credit note
  'returnCreditedStock'
]);
// Which streams each facade write puts records into (plan 2.4); used by the register tool and its test.
export const WRITE_STREAMS = Object.freeze({
  saveEstimate: ['invoices'], recordApproval: ['invoices'], issueBill: ['invoices'], addCcptNumber: ['invoices'], cancelBill: ['invoices'],
  issueCreditNote: ['invoices', 'receipts'], takeReceipt: ['receipts'], takeCounterReceipt: ['receipts'], refund: ['receipts'], reverseReceipt: ['receipts'],
  issueNoChargeSheet: ['invoices'], cancelNoChargeSheet: ['invoices'], voidJob: ['invoices'], decideLegacyAdvance: ['receipts'], setConfig: ['invoices'], runMigration: ['invoices'],
  returnCreditedStock: ['ledger']
});

export function samplesForPattern(pattern) {
  const base = pattern.replace('YYYY-MM', '2026-11').replace('FYyyyy-yy', 'FY2026-27');
  if (base.endsWith('[_pNN]')) { const b = base.slice(0, -6); return [b, b + '_p2', b + '_p10']; }
  return [base];
}

// A billing session as the shell gives it, mapped by the real www/shared/module-runtime.js (see realSession).
export const tierOf = (s) => (!s || !s.ok ? 'none' : s.isOwner ? 'owner' : s.isManager ? 'manager' : 'staff');
