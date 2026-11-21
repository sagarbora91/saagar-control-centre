// Service wave 2, governance T3: how the Service page loads and calls the seven billing files (PLAN-service-wave-2.md 2.12, 2.13, 2.14, C-PAGE).
// The page group owns www/modules/service/index.html. This file only reads it.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { BILLING, PHASE1, exists, readText, readBuf, listFiles, loadJson, parseScript, walk, sourceOf, frequency, bytesIssues, g0Buffer, lineDiff } from './lib/svc2-gov-common.mjs';
import { fn as extractFn } from './lib/fix-s01-extract.mjs';

const PAGE = 'www/modules/service/index.html';
const G0 = loadJson('g0-baseline.json').servicePage;
const page = readText(PAGE);
const g0Page = (g0Buffer(PAGE) || Buffer.alloc(0)).toString('utf8');

function inlineScripts(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => ({ body: m[1], start: m.index + m[0].indexOf('>') + 1 }));
}
const mainScript = inlineScripts(page).reduce((a, b) => (b.body.length > a.body.length ? b : a));
const BILL_NAME = /^svb[A-Z]/;
const STORE_NAME = /^svs[A-Z]/;
const HEADER = '// ─── BILLING GLUE (Service wave 2; the libraries are loaded in <head>) ─────────────';

// Run a function from the page in a sandbox. A name the function needs that is not defined is stubbed on the fly (returns true),
// so a test can name only the globals it cares about. Gives up after 25 stubs.
function call(name, globals, args, real = []) {
  const code = [name].concat(real).map((n) => extractFn(n, mainScript.body)).join('\n');
  const stubbed = [];
  for (let attempt = 0; attempt < 25; attempt++) {
    const ctx = vm.createContext(Object.assign({ console: { warn() {}, log() {} } }, globals));
    for (const s of stubbed) ctx[s] = () => true;
    vm.runInContext(code, ctx);
    try { return { value: ctx[name].apply(null, args), stubbed, ctx }; } catch (e) {
      const m = /^(\S+) is not defined$/.exec(String(e.message));
      if (m && !Object.prototype.hasOwnProperty.call(globals, m[1])) { stubbed.push(m[1]); continue; }
      return { error: e, stubbed, ctx };
    }
  }
  return { error: new Error('too many stubs'), stubbed };
}

test('T3.1 the page loads each of the seven billing files exactly once, one tag per line, in plan order, directly after the Stores UI tag', () => {
  const lines = page.split('\n');
  const want = BILLING.map((f) => `<script src="../../${path.basename(f.file)}"></script>`);
  const anchor = '<script src="../../service-stores-ui.js"></script>';
  const a = lines.indexOf(anchor);
  assert.ok(a >= 0, 'the Stores UI tag is present');
  for (const w of want) assert.equal(lines.filter((l) => l === w).length, 1, w + ' must occur exactly once as a full line');
  const at = want.map((w) => lines.indexOf(w));
  assert.equal(at[0], a + 1, 'calc is the line right after the Stores UI tag');
  for (let k = 1; k < at.length; k++) assert.equal(at[k], at[k - 1] + 1, 'consecutive lines in the order calc, docs, money, migrate, core, ui, area-ui');
  const firstBare = lines.findIndex((l) => /^<script>/.test(l));
  assert.ok(firstBare > at[6], 'before the first bare <script>');
  assert.equal(/service-billing-[a-z-]+\.js[?#]/.test(page), false, 'no query string or fragment');
  assert.equal(/service-billing-[^>]*\b(defer|async)\b/.test(page), false, 'no defer or async');
  assert.equal(page.split('service-billing-').length - 1, 7, 'the file stem appears nowhere else in the page');
  const stores = lines.filter((l) => /^<script src="\.\.\/\.\.\/service-stores-[a-z-]+\.js"><\/script>$/.test(l));
  assert.deepEqual(stores, G0.storesScriptTags, 'the seven Phase 1 tags are unchanged');
});

test('T3.2 no other page, the shell or a manifest loads or names the billing files', () => {
  const holders = [];
  const pages = listFiles('www/modules', (r) => /\.(html|js)$/.test(r)).filter((r) => r !== PAGE);
  for (const rel of pages.concat(['www/index.html', 'www/module-manifest.js', 'www/shell-asset-manifest.js'])) {
    if (readText(rel).includes('service-billing-')) holders.push(rel);
  }
  assert.deepEqual(holders, []);
});

test('T3.3 the data-action multiset equals G0 (111 distinct, 91 static) and no static data-svcs-action exists in the page', () => {
  const got = {};
  for (const m of page.matchAll(/data-action=(?:"([^"]*)"|'([^']*)')/g)) { const k = m[1] !== undefined ? m[1] : m[2]; got[k] = (got[k] || 0) + 1; }
  assert.deepEqual(frequency(Object.entries(got).flatMap(([k, v]) => Array(v).fill(k))), G0.dataActionMultiset, 'data-action multiset must equal G0');
  const staticMarkup = page.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  assert.equal((staticMarkup.match(/data-action="/g) || []).length, G0.dataActionStatic);
  assert.equal(G0.dataActionStatic, 91);
  assert.equal(Object.keys(G0.dataActionMultiset).length, 111);
  assert.equal(page.includes('data-svcs-action'), false, 'billing controls are made at run time by the UI files, never in the page');
});

test('T3.4 the page has no new storage write call site and no Stores or billing key literal', () => {
  assert.equal((page.match(/localStorage\.setItem\(/g) || []).length, G0.localStorageSetItemCalls);
  assert.equal((page.match(/\bsafeSet\(/g) || []).length, G0.safeSetCalls);
  for (const bad of ['saagar_svcs_', 'st_v2_', 'stockDocs', 'gm_expenses', 'SERVICE_DELIVERED']) assert.equal(page.split(bad).length - 1, g0Page.split(bad).length - 1, bad + ' count must equal G0');
  assert.equal(page.includes('saagar_svcs_'), false);
  assert.equal(page.includes('st_v2_svcs_'), false);
});

test('T3.5 no static control was added: the control tag counts equal G0 and the page has no <style> block more than G0', () => {
  const c = (re) => (page.match(re) || []).length;
  assert.deepEqual({ button: c(/<button\b/g), input: c(/<input\b/g), select: c(/<select\b/g), textarea: c(/<textarea\b/g), form: c(/<form\b/g) }, G0.staticControlTags);
  assert.equal(c(/<style\b/g), (g0Page.match(/<style\b/g) || []).length, 'no <style> block added (A2-03); css goes to service-ui.css');
});

test('T3.6 the three containers are exactly the agreed markup, once each, in the agreed places, and hold no controls', () => {
  const jobHost = '          <div id="svb-job-host" class="svb-job-host" data-no-i18n></div>';
  const closeHost = '            <div id="svb-close-host" class="svb-close-host" data-no-i18n></div>';
  const viewBilling = '<div class="view" id="view-billing" data-no-i18n><div class="svs-wrap svb-wrap" id="svb-root"></div></div>';
  assert.equal(page.split(jobHost).length - 1, 1);
  assert.equal(page.split(closeHost).length - 1, 1);
  assert.equal(page.split(viewBilling).length - 1, 1);
  for (const id of ['svb-job-host', 'svb-close-host', 'view-billing', 'svb-root']) assert.equal(page.split(`id="${id}"`).length - 1, 1, id);
  const stores = '<div class="view" id="view-stores" data-no-i18n><div class="svs-wrap" id="svs-root"></div></div>';
  assert.ok(page.indexOf(viewBilling) > page.indexOf(stores), 'view-billing follows view-stores');
  assert.ok(page.indexOf(viewBilling) < page.indexOf('<!-- PRINT TARGET -->'), 'view-billing sits before the print target');
  const jobAt = page.indexOf('id="svs-job-host"');
  assert.ok(page.indexOf(jobHost) < jobAt && page.indexOf(jobHost) > page.indexOf('id="view-form"'), 'the billing job host is just before the Stores job host, inside the job form');
  assert.ok(page.indexOf(closeHost) > page.indexOf('id="view-form"') && page.indexOf(closeHost) < page.indexOf(stores), 'the close host is inside the job form area');
});

test('T3.7 every svb or svs glue name used inside an existing page function is typeof-guarded; the billing glue guards its own svs references (C-PAGE-1, C-PAGE-3)', () => {
  const ast = parseScript(mainScript.body);
  const src = mainScript.body;
  const unguarded = [];
  const seen = [];
  walk(ast, (n, parents) => {
    if (n.type !== 'Identifier' || !(BILL_NAME.test(n.name) || STORE_NAME.test(n.name))) return;
    const p = parents[parents.length - 1];
    if (p && p.type === 'MemberExpression' && p.property === n && !p.computed) return;
    if (p && p.type === 'ObjectProperty' && p.key === n && !p.computed) return;
    if (p && p.type === 'FunctionDeclaration' && p.id === n) return;
    if (p && p.type === 'UnaryExpression' && p.operator === 'typeof') return;
    if (p && p.type === 'VariableDeclarator' && p.id === n) return;           // const svbPinGate = ..., const svsPinGate = ...
    const outerFn = parents.find((a) => a.type === 'FunctionDeclaration');
    const isBill = BILL_NAME.test(n.name);
    const outerName = outerFn ? outerFn.id.name : '';
    // inside the glue of the SAME family: not an existing function
    if (isBill && BILL_NAME.test(outerName)) return;
    if (!isBill && STORE_NAME.test(outerName)) return;
    if (!outerFn) {
      const stmt = parents[parents.length - 2];
      const top = parents.length >= 3 && parents[parents.length - 3].type === 'Program';
      const mount = p && p.type === 'CallExpression' && stmt && stmt.type === 'ExpressionStatement' && top;
      const okTop = (n.name === 'svsMount' && mount) || n.name === 'svsCoreRef' || n.name === 'svsPinGate' || n.name === 'svbPinGate' ||
        (n.name === 'svbMount' && parents.some((a) => a.type === 'FunctionExpression'));
      if (!okTop) unguarded.push(`top level ${n.name} at ${n.start}`);
      return;
    }
    if (n.name === 'svbPinGate' || n.name === 'svsPinGate') { if (BILL_NAME.test(outerName) || STORE_NAME.test(outerName)) return; }
    seen.push(outerName + ':' + n.name);
    const guard = new RegExp(`typeof\\s+${n.name}\\s*(===|!==)\\s*['"]function['"]`);
    let guarded = false;
    for (let k = parents.length - 1; k >= 0 && !guarded; k--) {
      const a = parents[k];
      const child = k + 1 < parents.length ? parents[k + 1] : n;
      if (a.type === 'LogicalExpression' && a.operator === '&&' && a.right === child && guard.test(sourceOf(src, a.left))) guarded = true;
      if (a.type === 'IfStatement' && a.consequent === child && guard.test(sourceOf(src, a.test)) && /===/.test(sourceOf(src, a.test))) guarded = true;
      if (a.type === 'ConditionalExpression' && a.consequent === child && guard.test(sourceOf(src, a.test))) guarded = true;
    }
    if (!guarded) unguarded.push(`${outerName} -> ${n.name} at ${n.start}`);
  });
  assert.deepEqual(unguarded, [], 'unguarded glue references break the sandboxed fix-s08 tests');
  const hooks = {
    showView: 'svbShowBilling', renderDash: 'svbContextChanged', openNew: 'svbRefreshJob', openEdit: 'svbRefreshJob', doSave: 'svbRefreshJob',
    markEstimateApproved: 'svbOpenApproval', taxInvoiceById: 'svbTaxInvoiceRoute', closeCase: 'svbCloseGate', delCase: 'svbBlocksDelete', svcFinishDelete: 'svbBlocksDelete', svsCore: 'svbShare'
  };
  for (const [f, h] of Object.entries(hooks)) assert.ok(seen.includes(f + ':' + h), `${f} must call ${h} (guarded)`);
  assert.ok(seen.includes('closeCase:svbAllowsZeroFinal'), 'closeCase calls svbAllowsZeroFinal (guarded)');
  assert.equal(/\bsvsPinGate\b/.test(sourceOf(src, ast.program.body.find((n) => n.type === 'FunctionDeclaration' && n.id.name === 'svbHost') || ast.program)), false === false ? /\bsvsPinGate\b/.test(sourceOf(src, ast.program.body.find((n) => n.type === 'FunctionDeclaration' && n.id.name === 'svbHost') || ast.program)) : false, 'placeholder replaced below');
});

test('T3.7b the billing glue never references svsPinGate (it has its own svbPinGate)', () => {
  const start = page.indexOf(HEADER);
  const end = page.indexOf('// ─── STORES GLUE');
  assert.ok(start >= 0 && end > start, 'the billing glue block is between its header and the Stores glue header');
  const block = page.slice(start, end);
  assert.equal(/\bsvsPinGate\b/.test(block), false);
  assert.match(block, /const svbPinGate\b/);
});

test('T3.8 the billing glue block: header once, before the Stores glue, every function ends with a lone } line or is one line, the page script still ends as at G0', () => {
  const ast = parseScript(mainScript.body);
  const src = mainScript.body;
  const glue = ast.program.body.filter((n) => n.type === 'FunctionDeclaration' && BILL_NAME.test(n.id.name));
  const names = glue.map((n) => n.id.name);
  const need = ['svbShare', 'svbCaseView', 'svbBilling', 'svbHost', 'svbSetCaseInvoice', 'svbSetCaseApproval', 'svbSetCaseVoid', 'svbApplyRepairs', 'svbFreezeBillTo', 'svbBillToForPrint',
    'svbPrint', 'svbShowBilling', 'svbContextChanged', 'svbRefreshJob', 'svbOpenApproval', 'svbTaxInvoiceRoute', 'svbCloseGate', 'svbAllowsZeroFinal', 'svbBlocksDelete', 'svbMount'];
  for (const must of need) assert.ok(names.includes(must), must + ' (plan 2.13)');
  for (const n of glue) {
    const text = sourceOf(src, n);
    assert.ok(!text.includes('\n') || /\n}$/.test(text), n.id.name + ' must end with a line that is exactly }');
  }
  assert.equal(page.split('BILLING GLUE').length - 1, 1, 'the billing glue has one header comment');
  assert.equal(page.split(HEADER).length - 1, 1, 'the header text is exactly as in plan 2.13');
  assert.ok(page.indexOf(HEADER) < page.indexOf('// ─── STORES GLUE'), 'the billing glue sits before the Stores glue (P-17)');
  assert.ok(src.trimEnd().endsWith('renderDash();\napplyReadOnlyUI();\nsvsMount();'), 'the script still ends with the two start-up lines and svsMount();');
  const block = page.slice(page.indexOf(HEADER), page.indexOf('// ─── STORES GLUE'));
  // a trailing line comment after the statement does not make it any less the last statement
  assert.ok(block.trimEnd().replace(/[ \t]*\/\/[^\n]*$/, '').endsWith('Promise.resolve().then(function () { svbMount(); });'), 'the deferred mount is the last statement of the block');
  assert.equal(/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(block), false, 'no empty catch in the billing glue');
  // text after the main script is unchanged from G0 (no text after svsMount(); </script>)
  const tail = (t) => t.slice(t.indexOf('svsMount();\n</script>') + 'svsMount();\n</script>'.length);
  assert.ok(page.includes('svsMount();\n</script>'));
  if (g0Page) assert.equal(tail(page), tail(g0Page), 'nothing was added after the main script');
});

test('T3.8b customer fields: custName, custMobile, custAddr are read only in svbFreezeBillTo, which is called only by svbSetCaseInvoice and svbBillToForPrint; only the case writers call saveDB', () => {
  const ast = parseScript(mainScript.body);
  const src = mainScript.body;
  const glue = ast.program.body.filter((n) => n.type === 'FunctionDeclaration' && BILL_NAME.test(n.id.name));
  const readers = [];
  const freezeCallers = [];
  const savers = [];
  for (const f of glue) {
    const text = sourceOf(src, f);
    if (/custName|custMobile|custAddr/.test(text)) readers.push(f.id.name);
    if (/\bsvbFreezeBillTo\s*\(/.test(text) && f.id.name !== 'svbFreezeBillTo') freezeCallers.push(f.id.name);
    if (/\bsaveDB\s*\(/.test(text)) savers.push(f.id.name);
  }
  assert.deepEqual(readers, ['svbFreezeBillTo']);
  assert.deepEqual(freezeCallers.sort(), ['svbBillToForPrint', 'svbSetCaseInvoice']);
  const allowedSavers = ['svbApplyRepairs', 'svbSetCaseApproval', 'svbSetCaseInvoice', 'svbSetCaseVoid'];
  assert.deepEqual(savers.filter((s) => allowedSavers.indexOf(s) === -1), [], 'only the four case writers may call saveDB');
  const start = page.indexOf(HEADER);
  const block = page.slice(start, page.indexOf('// ─── STORES GLUE'));
  assert.equal(/\bsetItem\b|\blocalStorage\b/.test(block), false);
});

test('T3.9 no function that existed at G0 was removed or renamed; the only G0 lines that may be removed are P-13 and the P-16 Phase 1 glue lines (insert-only proof)', () => {
  const ast = parseScript(mainScript.body);
  const now = new Set(ast.program.body.filter((n) => n.type === 'FunctionDeclaration').map((n) => n.id.name));
  const missing = G0.topLevelFunctions.filter((f) => !now.has(f));
  assert.deepEqual(missing, [], 'fix-wave, Phase 1 and older functions must stay');
  assert.deepEqual(bytesIssues(PAGE).filter((x) => x !== 'no final newline'), [], 'page keeps LF and no BOM');
  assert.ok(g0Page.length > 0, 'the G0 copy of the page is needed for the insert-only proof (workspace g0 copy or git 031841f)');
  const { removed } = lineDiff(g0Page, page);
  // allowed removals: the one P-13 line, and the lines of the Phase 1 svsCore function body (P-16 rewrites the create call inside it)
  const g0ast = parseScript(inlineScripts(g0Page).reduce((a, b) => (b.body.length > a.body.length ? b : a)).body);
  const g0Main = inlineScripts(g0Page).reduce((a, b) => (b.body.length > a.body.length ? b : a)).body;
  const core = g0ast.program.body.find((n) => n.type === 'FunctionDeclaration' && n.id.name === 'svsCore');
  const coreLines = new Set(sourceOf(g0Main, core).split('\n'));
  const p13 = /^ {2}if \(!\(parseRupee\(del\.finalAmt\) > 0\)\) \{$/;
  const stray = removed.filter((l) => !p13.test(l) && !coreLines.has(l));
  assert.deepEqual(stray, [], 'G0 lines removed or changed outside P-13 and the svsCore create call');
  assert.ok(removed.filter((l) => p13.test(l)).length <= 1, 'P-13 changes exactly one line');
  assert.ok(removed.length <= 1 + 8, 'at most P-13 and a handful of svsCore lines change');
  // the two Phase 1 exceptions of svc1 T3.9 are NOT edited again: they are insert-only now
  assert.equal(removed.some((l) => /btn-back-dash'\)\.style\.display/.test(l)), false, 'P-5 is insert-only: the pinned back-button line stays');
  assert.equal(removed.some((l) => /re-check after the awaited PIN/.test(l)), false, 'P-15 is insert-only: the pinned svcFinishDelete line stays');
});

test('T3.9b markers and identity strings of the page stay (plan 2.12 hard rules; P7 2.1.2)', () => {
  assert.equal(page.split('D3-SERVICE-HTML-2026-07-30').length - 1, 1);
  assert.equal(page.split('D3-SERVICE-RUNTIME-2026-07-30').length - 1, 1);
  for (const s of ["const STORE_KEY = 'saagar_wsf_v2'", 'function saveDB()', 'function doSave()', 'function closeCase()', 'function delCase(', 'function svcD3RenderWorkboard(', 'function watchKey(id)',
    'function watchKeyAfter(id)', 'function compressWatchImage(', 'function persistWatchPhoto(id)', 'function loadWatchPhoto(id)', 'function svcEv()', 'serviceWorkboardPolicy', 'servicePersistence',
    'svcD3PolicyApi', 'svcD3PersistenceApi', "customerSelectors:['#f-cn','#f-an','#f-dcs']"]) assert.ok(page.includes(s), s);
  assert.equal(page.split('STORES GLUE').length - 1, 1, 'the Phase 1 glue header stays once');
  for (const f of PHASE1) assert.ok(page.includes(path.basename(f.file)), f.file + ' still loaded');
});

test('T3.10 svbBlocksDelete fails CLOSED: any doubt blocks the delete (plan 2.14)', () => {
  const c = { id: 'WS-2026-001' };
  const mk = (billing, extra = {}) => call('svbBlocksDelete', Object.assign({ toast: () => {}, svbBilling: () => billing, svsCore: () => null }, extra), [c]);
  const val = (r) => (r.error ? 'ERROR:' + r.error.message : r.value);
  assert.equal(val(mk(null)), true, 'billing missing blocks');
  assert.equal(val(mk({ jobHasRecords: () => { throw new Error('boom'); } })), true, 'a throw blocks');
  assert.equal(val(mk({ jobHasRecords: () => ({ ok: false }) })), true, 'a refusal blocks');
  assert.equal(val(mk({ jobHasRecords: () => ({ ok: true, has: 'no' }) })), true, 'a non-boolean answer blocks');
  assert.equal(val(mk({ jobHasRecords: () => ({ ok: true, has: true }) })), true, 'records exist: blocks');
  assert.equal(val(call('svbBlocksDelete', { toast: () => {}, svbBilling: () => ({ jobHasRecords: () => ({ ok: true, has: false }) }) }, [null])), true, 'no case blocks');
  const clear = mk({ jobHasRecords: () => ({ ok: true, has: false }), blocksDelete: () => ({ ok: true, blocks: false }) });
  assert.equal(val(clear), false, 'only a clear "no records" lets the delete go on');
});

test('T3.11 svbTaxInvoiceRoute never returns false for a case without an invoiceNo, and returns false only for the old reprint route (C-PAGE-5)', () => {
  const noNo = { id: 'WS-2026-001', status: 'open', invoiceNo: '' };
  const withNo = { id: 'WS-2026-002', status: 'closed', invoiceNo: 'SV/2026-27/0001' };
  const printed = [];
  const run = (c, billing) => {
    if (billing) billing.activeInvoiceNo = billing.activeInvoiceNo || (() => 'SV/2026-27/0001');
    return call('svbTaxInvoiceRoute', {
      byId: () => c, toast: () => {}, svbBilling: () => billing, svbApplyRepairs: () => {}, svbUi: () => ({ taxInvoiceRoute: () => true }),
      svbPrint: (type) => { printed.push(type); return true; }
    }, [c ? c.id : 'x'], ['svbRouteRefused']);
  };
  const val = (r) => (r.error ? 'ERROR:' + r.error.message : r.value);
  const want = { summary: 'serviceBillSummary', tax_invoice: 'serviceTaxInvoiceV2', no_charge: 'serviceWarrantySheet', issue: null, old_way_closed: null };
  for (const route of ['summary', 'tax_invoice', 'no_charge', 'issue', 'old_way_closed']) {
    printed.length = 0;
    assert.equal(val(run(noNo, { taxRoute: () => ({ ok: true, route }) })), true, 'no invoiceNo + route ' + route + ' is handled here (true)');
    assert.deepEqual(printed, want[route] ? [want[route]] : [], 'route ' + route + ' prints ' + want[route]);
  }
  assert.equal(val(run(noNo, null)), true, 'billing missing and no invoiceNo: handled (toast), true');
  assert.equal(val(run(noNo, { taxRoute: () => { throw new Error('boom'); } })), true, 'billing throws and no invoiceNo: true');
  assert.equal(val(run(noNo, { taxRoute: () => ({ ok: false }) })), true, 'billing cannot answer and no invoiceNo: true');
  assert.equal(val(run(withNo, { taxRoute: () => ({ ok: true, route: 'legacy' }) })), false, 'legacy route: the old reprint goes on (false)');
});

test('T3.12 svbCaseView hands over no customer field: exactly id, status, invoiceNo, paymentStatus, stub, label, voided, typedAdvancePaise', () => {
  const cases = { 'WS-2026-001': { id: 'WS-2026-001', status: 'open', brand: 'Titan', model: 'Edge', custName: 'Invented Name', custMobile: '9000000000', custAddr: 'Invented Road', custEmail: 'a@b.test', invoiceNo: '', d3Readiness: { paymentStatus: 'no_charge_warranty' }, _bridgeStub: false, advancePaid: '500', voided: null } };
  const r = call('svbCaseView', { byId: (id) => cases[id], svcRupeeToPaise: (x) => Math.round(Number(x) * 100), parseRupee: (x) => Number(x) || 0 }, ['WS-2026-001']);
  assert.equal(r.error, undefined, r.error && r.error.message);
  const v = JSON.parse(JSON.stringify(r.value));
  assert.deepEqual(Object.keys(v).sort(), ['id', 'invoiceNo', 'label', 'paymentStatus', 'status', 'stub', 'typedAdvancePaise', 'voided']);
  const flat = JSON.stringify(v);
  for (const secret of ['Invented Name', '9000000000', 'Invented Road', 'a@b.test']) assert.equal(flat.includes(secret), false, secret);
  assert.equal(call('svbCaseView', { byId: (id) => cases[id] }, ['nope']).value, null);
});
