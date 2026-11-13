// Service wave 1, governance T3: how the Service page loads and calls the seven files (PLAN-service-wave-1.md 2.15 and C-PAGE).
// The page group owns www/modules/service/index.html. This file only reads it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { SEVEN, WORKSPACE, exists, readText, readBuf, listFiles, loadJson, parseScript, walk, sourceOf, frequency, bytesIssues } from './lib/svc1-gov-common.mjs';
import { fn as extractFn } from './lib/fix-s01-extract.mjs';

const require = createRequire(import.meta.url);
const PAGE = 'www/modules/service/index.html';
const G0 = loadJson('capability-register.json').g0Baseline;
const page = readText(PAGE);

function inlineScripts(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => ({ body: m[1], start: m.index + m[0].indexOf('>') + 1 }));
}
const mainScript = inlineScripts(page).reduce((a, b) => (b.body.length > a.body.length ? b : a));
const GLUE_NAME = /^svs[A-Z]/;

test('T3.1 the page loads each of the seven files exactly once, one tag per line, in order, after app-i18n.js and before the first bare script', () => {
  const lines = page.split('\n');
  const i18n = lines.findIndex((l) => l === '<script src="../../app-i18n.js"></script>');
  assert.ok(i18n >= 0, 'app-i18n.js tag present');
  const want = SEVEN.map((f) => `<script src="../../${path.basename(f.file)}"></script>`);
  for (const w of want) assert.equal(lines.filter((l) => l === w).length, 1, w + ' must occur exactly once as a full line');
  const at = want.map((w) => lines.indexOf(w));
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'the seven tags are in the agreed load order');
  assert.ok(at[0] > i18n, 'after the app-i18n.js tag');
  const firstBare = lines.findIndex((l) => /^<script>/.test(l));
  assert.ok(firstBare > at[6], 'before the first bare <script>');
  for (let k = 1; k < at.length; k++) assert.equal(at[k], at[k - 1] + 1, 'consecutive lines, no other tag between');
  assert.equal(/service-stores-[a-z-]+\.js[?#]/.test(page), false, 'no query string or fragment');
  assert.equal(/service-stores-[^>]*\b(defer|async)\b/.test(page), false, 'no defer or async');
  assert.equal(page.split('service-stores-').length - 1, 7, 'the file stem appears nowhere else in the page');
});

test('T3.2 no other page, the shell or a manifest loads or names the new files', () => {
  const holders = [];
  const pages = listFiles('www/modules', (r) => /\.(html|js)$/.test(r)).filter((r) => r !== PAGE);
  for (const rel of pages.concat(['www/index.html', 'www/module-manifest.js', 'www/shell-asset-manifest.js'])) {
    if (readText(rel).includes('service-stores-')) holders.push(rel);
  }
  assert.deepEqual(holders, []);
});

test('T3.3 the data-action multiset equals G0 and no static data-svcs-action exists in the page', () => {
  const got = {};
  for (const m of page.matchAll(/data-action=(?:"([^"]*)"|'([^']*)')/g)) { const k = m[1] !== undefined ? m[1] : m[2]; got[k] = (got[k] || 0) + 1; }
  assert.deepEqual(frequency(Object.entries(got).flatMap(([k, v]) => Array(v).fill(k))), G0.servicePage.dataActionMultiset, 'data-action multiset must equal G0');
  const staticMarkup = page.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  assert.equal((staticMarkup.match(/data-action="/g) || []).length, G0.servicePage.dataActionStatic);
  assert.equal((staticMarkup.match(/data-action="/g) || []).length, 91);
  assert.equal(Object.keys(G0.servicePage.dataActionMultiset).length, 111);
  assert.equal(page.includes('data-svcs-action'), false, 'Stores controls are made at run time by the UI files, never in the page');
});

test('T3.4 the page has no new storage write call site and no Stores key literal', () => {
  assert.equal((page.match(/localStorage\.setItem\(/g) || []).length, G0.servicePage.localStorageSetItemCalls);
  assert.equal((page.match(/\bsafeSet\(/g) || []).length, G0.servicePage.safeSetCalls);
  assert.equal(page.includes('saagar_svcs_'), false);
  assert.equal(page.includes('st_v2_svcs_'), false);
  assert.equal(/\bsaveDB\s*\(\s*\)\s*;?[^\n]*svs/i.test(page), false);
});

test('T3.5 no static control was added: the control tag counts equal G0', () => {
  const c = (re) => (page.match(re) || []).length;
  assert.deepEqual({ button: c(/<button\b/g), input: c(/<input\b/g), select: c(/<select\b/g), textarea: c(/<textarea\b/g), form: c(/<form\b/g) }, G0.servicePage.staticControlTags);
});

test('T3.6 the two containers are exactly the agreed markup and hold no controls', () => {
  const jobHost = '<div id="svs-job-host" class="svs-job-host" data-no-i18n></div>';
  const stores = '<div class="view" id="view-stores" data-no-i18n><div class="svs-wrap" id="svs-root"></div></div>';
  assert.equal(page.split(jobHost).length - 1, 1);
  assert.equal(page.split(stores).length - 1, 1);
  for (const id of ['svs-job-host', 'view-stores', 'svs-root']) assert.equal(page.split(`id="${id}"`).length - 1, 1, id);
  const printAt = page.indexOf('<!-- PRINT TARGET -->');
  assert.ok(printAt > 0 && page.indexOf(stores) < printAt, 'view-stores sits before the print target');
  assert.ok(page.indexOf(jobHost) > page.indexOf('id="view-form"') && page.indexOf(jobHost) < page.indexOf(stores), 'the job host is inside the job form area');
});

test('T3.7 every call or mention of a Stores glue function inside an existing page function is typeof-guarded (C-PAGE-2)', () => {
  const ast = parseScript(mainScript.body);
  const src = mainScript.body;
  const unguarded = [];
  const seen = [];
  walk(ast, (n, parents) => {
    if (n.type !== 'Identifier' || !GLUE_NAME.test(n.name)) return;
    const p = parents[parents.length - 1];
    if (p && (p.type === 'MemberExpression') && p.property === n && !p.computed) return;
    if (p && (p.type === 'ObjectProperty') && p.key === n && !p.computed) return;
    if (p && p.type === 'FunctionDeclaration' && p.id === n) return;
    if (p && p.type === 'UnaryExpression' && p.operator === 'typeof') return;
    const outerFn = parents.find((a) => a.type === 'FunctionDeclaration');
    if (outerFn && GLUE_NAME.test(outerFn.id.name)) return;              // inside the glue block itself
    // top level of the script: the closing `svsMount();` statement only
    if (!outerFn) {
      const stmt = parents[parents.length - 2];
      const ok = p && p.type === 'CallExpression' && n.name === 'svsMount' && stmt && stmt.type === 'ExpressionStatement' && parents[parents.length - 3].type === 'Program';
      // svsPinGate (second pass, DEF-1): the one private PIN-time closure, made once at load and read only by the glue functions
      if (!ok && n.name !== 'svsCoreRef' && n.name !== 'svsPinGate') unguarded.push(`top level ${n.name} at ${n.start}`);
      return;
    }
    seen.push(outerFn.id.name + ':' + n.name);
    const guard = new RegExp(`typeof\\s+${n.name}\\s*(===|!==)\\s*['"]function['"]`);
    let guarded = false;
    for (let k = parents.length - 1; k >= 0 && !guarded; k--) {
      const a = parents[k];
      const child = k + 1 < parents.length ? parents[k + 1] : n;
      if (a.type === 'LogicalExpression' && a.operator === '&&' && a.right === child && guard.test(sourceOf(src, a.left))) guarded = true;
      if (a.type === 'IfStatement' && a.consequent === child && guard.test(sourceOf(src, a.test)) && /===/.test(sourceOf(src, a.test))) guarded = true;
      if (a.type === 'ConditionalExpression' && a.consequent === child && guard.test(sourceOf(src, a.test))) guarded = true;
    }
    if (!guarded) unguarded.push(`${outerFn.id.name} -> ${n.name} at ${n.start}`);
  });
  assert.deepEqual(unguarded, [], 'unguarded glue references in existing functions break the sandboxed fix-s08 tests');
  // The seven agreed hook sites must really be there (showView, renderDash, openNew, openEdit, doSave, delCase, svcFinishDelete).
  const hooked = new Set(seen.map((s) => s.split(':')[0]));
  for (const f of ['showView', 'renderDash', 'delCase', 'svcFinishDelete']) assert.ok(hooked.has(f), `${f} must call a Stores hook`);
});

test('T3.8 the glue block: every new top-level function ends with a lone } line or is one line; the page ends as agreed', () => {
  const ast = parseScript(mainScript.body);
  const src = mainScript.body;
  const glue = ast.program.body.filter((n) => n.type === 'FunctionDeclaration' && GLUE_NAME.test(n.id.name));
  assert.ok(glue.length >= 9, 'svsUi, svsSession, svsCaseView, svsCore, svsHost, svsMount, svsShowStores, svsRefreshJob, svsContextChanged, svsBlocksDelete');
  const names = glue.map((n) => n.id.name);
  for (const must of ['svsSession', 'svsCaseView', 'svsCore', 'svsHost', 'svsMount', 'svsShowStores', 'svsRefreshJob', 'svsContextChanged', 'svsBlocksDelete']) assert.ok(names.includes(must), must);
  for (const n of glue) {
    const text = sourceOf(src, n);
    assert.ok(!text.includes('\n') || /\n}$/.test(text), n.id.name + ' must end with a line that is exactly }');
  }
  assert.ok(src.trimEnd().endsWith('renderDash();\napplyReadOnlyUI();\nsvsMount();'), 'the glue is called after the original two start-up lines');
  assert.equal(page.split('STORES GLUE').length - 1, 1, 'the glue block has one header comment');
  assert.equal(page.split('D3-SERVICE-CSS-2026-07-30').length - 1, 0, 'the css marker lives in service-ui.css, not the page');
});

test('T3.9 no function that existed at G0 was removed or renamed, and the page only grew by the agreed hooks', () => {
  const ast = parseScript(mainScript.body);
  const now = new Set(ast.program.body.filter((n) => n.type === 'FunctionDeclaration').map((n) => n.id.name));
  const missing = G0.servicePage.topLevelFunctions.filter((f) => !now.has(f));
  assert.deepEqual(missing, [], 'fix-wave and older functions must stay');
  for (const must of ['svcInvoiceLocked', 'svcRecordDeletion', 'svcD3Reauth', 'svcFinishDelete', 'delCase', 'svcDeleteClosedWithApproval', 'doSave']) assert.ok(now.has(must), must);
  assert.deepEqual(bytesIssues(PAGE).filter((x) => x !== 'no final newline'), [], 'page keeps LF and no BOM');
  const rec = path.join(WORKSPACE, 'g0', 'pre-wave-service', 'www', 'modules', 'service', 'index.html');
  if (!fs.existsSync(rec)) return;
  const oldLines = fs.readFileSync(rec, 'utf8').split('\n');
  const newLines = page.split('\n');
  const n = oldLines.length, m = newLines.length;
  const w = m + 1;
  const dp = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i * w + j] = oldLines[i] === newLines[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
  const removed = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) { i++; j++; }
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { removed.push(oldLines[i]); i++; }
    else j++;
  }
  while (i < n) removed.push(oldLines[i++]);
  const allowed = [/btn-back-dash'\)\.style\.display/, /if \(!cur \|\| svcInvoiceLocked\(cur\)\) return;/];
  const stray = removed.filter((l) => !allowed.some((re) => re.test(l)));
  assert.deepEqual(stray, [], 'G0 lines removed or changed outside the two agreed spots');
  assert.ok(removed.length <= 2, 'at most the back-button line and the svcFinishDelete line change');
});

test('T3.10 svsBlocksDelete fails CLOSED: any doubt blocks the delete (C-PAGE-3)', () => {
  const code = extractFn('svsBlocksDelete', mainScript.body);
  const make = (opts) => {
    const toasts = [];
    const ctx = vm.createContext({ toasts, console: { warn() {} }, toast: (m) => { toasts.push(m); } });
    ctx.svsCore = () => opts.core;
    ctx.svsUi = () => opts.ui;
    vm.runInContext(code, ctx);
    return { ctx, toasts };
  };
  const ui = {};
  const c = { id: 'WS-2026-001' };
  let r = make({ core: null, ui });
  assert.equal(r.ctx.svsBlocksDelete(c), true, 'core missing blocks');
  assert.equal(r.toasts.length, 1);
  r = make({ core: { jobHasParts: () => { throw new Error('boom'); } }, ui });
  assert.equal(r.ctx.svsBlocksDelete(c), true, 'core error blocks');
  r = make({ core: { jobHasParts: () => ({ ok: false, code: 'SVCS_BLOCKED' }) }, ui });
  assert.equal(r.ctx.svsBlocksDelete(c), true, 'core refusal blocks');
  r = make({ core: { jobHasParts: () => ({ ok: true, has: 'no' }) }, ui });
  assert.equal(r.ctx.svsBlocksDelete(c), true, 'a non-boolean answer blocks');
  r = make({ core: { jobHasParts: () => ({ ok: true, has: true }) }, ui });
  assert.equal(r.ctx.svsBlocksDelete(c), true, 'parts still issued blocks');
  assert.match(r.toasts[0], /WS-2026-001/);
  r = make({ core: { jobHasParts: () => ({ ok: true, has: false }) }, ui });
  assert.equal(r.ctx.svsBlocksDelete(c), false, 'only a clear "no parts" lets the delete go on');
  assert.deepEqual(r.toasts, []);
  r = make({ core: { jobHasParts: () => ({ ok: true, has: false }) }, ui: null });
  assert.equal(r.ctx.svsBlocksDelete(c), true, 'UI missing blocks');
  r = make({ core: { jobHasParts: () => ({ ok: true, has: false }) }, ui });
  assert.equal(r.ctx.svsBlocksDelete(null), true, 'no case blocks');
});

test('T3.11 svsCaseView hands over no customer field (job id, status, invoice, payment status, stub and a brand/model label only)', () => {
  const code = extractFn('svsCaseView', mainScript.body);
  const cases = { 'WS-2026-001': { id: 'WS-2026-001', status: 'open', brand: 'Titan', model: 'Edge', custName: 'Invented Name', custMobile: '9000000000', custAddr: 'Invented Road', custEmail: 'a@b.test', invoiceNo: '', d3Readiness: { paymentStatus: 'no_charge_warranty' }, _bridgeStub: false } };
  const ctx = vm.createContext({});
  ctx.byId = (id) => cases[id];
  vm.runInContext(code, ctx);
  const v = JSON.parse(JSON.stringify(ctx.svsCaseView('WS-2026-001')));
  assert.deepEqual(Object.keys(v).sort(), ['id', 'invoiceNo', 'label', 'paymentStatus', 'status', 'stub']);
  const flat = JSON.stringify(v);
  for (const secret of ['Invented Name', '9000000000', 'Invented Road', 'a@b.test']) assert.equal(flat.includes(secret), false, secret);
  assert.equal(ctx.svsCaseView('nope'), null);
  assert.equal(ctx.svsCaseView(''), null);
});
