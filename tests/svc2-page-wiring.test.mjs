// Service wave 2, W-PAGE: static wiring of the Service page (P5 U83 to U89, plus the insert-only proof).
// Expected values are typed by hand from PLAN-service-wave-2.md 2.12 and 2.13.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.resolve(here, '../www/modules/service/index.html');
const PRE = process.env.SVC2_PRE_WAVE_PAGE || 'E:\\Projects\\Saagar Control Centre Workspace\\service-wave-2\\g0\\pre-wave-service2\\www\\modules\\service\\index.html';
const PRE_SHA = '39a35a8a0bd094053d5bd073881eb388f4338dd97e75fe80f7e5e4b3fa7097bd';
const buf = fs.readFileSync(PAGE);
const page = buf.toString('utf8');
const count = (s, needle) => s.split(needle).length - 1;
const BLOCK_START = '// ─── BILLING GLUE (Service wave 2; the libraries are loaded in <head>) ─────────────';
const PHASE1_START = '// ─── STORES GLUE (Service Stores, Phase 1; the libraries are loaded in <head>) ─────────────';
const block = page.slice(page.indexOf(BLOCK_START), page.indexOf(PHASE1_START));
const withoutBlock = page.replace(block, '');
const head = page.slice(0, page.indexOf('</head>'));
const staticMarkup = s => s.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');

// ---------- the diff against the pre-wave copy (line level, longest common subsequence) ----------
function diffLines(oldText, newText) {
  const a = oldText.split('\n'), b = newText.split('\n');
  const n = a.length, m = b.length, w = m + 1;
  const dp = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
  const removed = [], added = [], regions = [];
  let i = 0, j = 0, open = false;
  const touch = () => { if (!open) { regions.push(1); open = true; } };
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; open = false; }
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { touch(); removed.push(a[i]); i++; }
    else { touch(); added.push(b[j]); j++; }
  }
  while (i < n) { touch(); removed.push(a[i++]); }
  while (j < m) { touch(); added.push(b[j++]); }
  return { removed, added, regions: regions.length };
}

test('U83 the page is LF only, no BOM, starts with the doctype', () => {
  assert.equal(buf.includes(13), false);
  assert.notEqual(buf[0], 0xEF);
  assert.ok(page.startsWith('<!DOCTYPE html>'));
});

test('insert-only proof: against the pre-wave copy exactly two old lines change (P-13 and the P-16 line), in 17 regions', { skip: !fs.existsSync(PRE) && 'the pre-wave copy is in the workspace, which is not on this machine' }, () => {
  const pre = fs.readFileSync(PRE);
  assert.equal(crypto.createHash('sha256').update(pre).digest('hex'), PRE_SHA, 'the copy compared against is the Phase 1 page of commit 031841f');
  const { removed, added, regions } = diffLines(pre.toString('utf8'), page);
  assert.deepEqual(removed, [
    '  if (!(parseRupee(del.finalAmt) > 0)) {',
    '    const made = SaagarServiceStoresCore.create({ adapter: SaagarServiceStoresStore.adapterFromWindow(window), now: () => new Date(), cases: { get: svsCaseView }, session: svsSession, stepUpAt: svsPinGate.at });'
  ]);
  assert.equal(regions, 17, 'P-1 to P-17, one region each');
  assert.ok(added.length > 400, 'the glue block is added');
  assert.equal(added.some(l => l.includes('\r')), false);
  // the two changed lines come back as the plan words them
  assert.ok(added.includes('  if (!(parseRupee(del.finalAmt) > 0) && !(typeof svbAllowsZeroFinal === \'function\' && svbAllowsZeroFinal(editId))) {'));
  assert.ok(added.includes('    const o = { adapter: SaagarServiceStoresStore.adapterFromWindow(window), now: () => new Date(), cases: { get: svsCaseView }, session: svsSession, stepUpAt: svsPinGate.at };'));
  assert.ok(added.includes('    if (typeof svbShare === \'function\') o.share = svbShare;'));
  assert.ok(added.includes('    const made = SaagarServiceStoresCore.create(o);'));
});

test('U84 the seven billing tags follow service-stores-ui.js, once each, in order, inside head, plain', () => {
  const names = ['calc', 'docs', 'money', 'migrate', 'core', 'ui', 'area-ui'].map(n => `<script src="../../service-billing-${n}.js"></script>`);
  const lines = page.split('\n');
  const ui = lines.indexOf('<script src="../../service-stores-ui.js"></script>');
  assert.ok(ui > 0);
  names.forEach((t, k) => { assert.equal(count(page, t), 1, t); assert.equal(lines[ui + 1 + k], t, 'directly after, in order: ' + t); assert.ok(head.includes(t)); });
  assert.equal(count(page, 'service-billing-'), 7, 'the stem appears nowhere else');
  assert.equal(/service-billing-[^>]*(\bdefer\b|\basync\b|\?)/.test(page), false);
  // the seven Phase 1 tags are still consecutive after app-i18n.js
  const i18n = lines.indexOf('<script src="../../app-i18n.js"></script>');
  ['store', 'fifo', 'masters', 'docs', 'core', 'masters-ui', 'ui'].forEach((n, k) => assert.equal(lines[i18n + 1 + k], `<script src="../../service-stores-${n}.js"></script>`));
  assert.ok(page.indexOf('href="service-ui.css"') < page.indexOf('<script>'), 'service-ui.css before the first bare script');
});

test('U84b the MAH-4 contract source accepts the new tags as local scripts', async () => {
  const mod = await import('../scripts/lib/mah4-contract-source.mjs');
  const srcs = mod.scriptSources(page).map(s => (typeof s === 'string' ? s : s.src || s.ref || ''));
  ['calc', 'docs', 'money', 'migrate', 'core', 'ui', 'area-ui'].forEach(n => {
    assert.ok(srcs.some(s => s.endsWith(`service-billing-${n}.js`)), n);
    assert.equal(mod.resolveLocalScript('modules/service/index.html', `../../service-billing-${n}.js`), `service-billing-${n}.js`);
  });
});

test('U85 three new empty hosts and one view, with no control in them', () => {
  const jobHost = '<div id="svb-job-host" class="svb-job-host" data-no-i18n></div>';
  const closeHost = '<div id="svb-close-host" class="svb-close-host" data-no-i18n></div>';
  const view = '<div class="view" id="view-billing" data-no-i18n><div class="svs-wrap svb-wrap" id="svb-root"></div></div>';
  [jobHost, closeHost, view].forEach(t => { assert.equal(count(page, t), 1, t); });
  ['id="svb-job-host"', 'id="svb-close-host"', 'id="view-billing"', 'id="svb-root"'].forEach(m => assert.equal(count(page, m), 1, m));
  assert.ok(page.indexOf(jobHost) > page.indexOf('id="sec-7"') && page.indexOf(jobHost) < page.indexOf('id="svs-job-host"'), 'billing host is inside section 7, before the Stores host');
  assert.equal(page.indexOf('id="svb-job-host"') < page.indexOf('<!-- S8 TERMS -->'), true);
  assert.ok(page.indexOf(closeHost) > page.indexOf('id="s11-open"'), 'close host is inside the open part of section 11');
  assert.ok(page.indexOf(closeHost) < page.indexOf('data-action="mark-as-delivered-amp-close-case"'), 'before the buttons');
  assert.ok(page.indexOf('id="view-stores"') < page.indexOf(view) && page.indexOf(view) < page.indexOf('<!-- PRINT TARGET -->'));
  ['id="svb-job-host"', 'id="svb-close-host"', 'id="view-billing"'].forEach(marker => {
    const start = page.indexOf(marker);
    const line = page.slice(page.lastIndexOf('\n', start) + 1, page.indexOf('\n', start));
    assert.equal(/data-action|<button|<input|<select|<form|<textarea|onclick/i.test(line), false, marker);
  });
});

test('U86 no static control or action was added: counts equal the pre-wave page, and the page has no data-svcs-action', () => {
  const unique = text => new Set([...text.matchAll(/\bdata-action="([^"]+)"/g)].map(m => m[1]));
  assert.equal(unique(staticMarkup(page)).size, 91);
  assert.equal(unique(page).size, 111);
  assert.equal(page.includes('data-svcs-action'), false);
  assert.equal(count(page, 'data-action'), 111, 'every occurrence of the text data-action, as before (typed from the pre-wave page)');
  const c = re => (page.match(re) || []).length;
  // typed from the pre-wave page: the numbers the Phase 1 governance test also pins
  assert.deepEqual({ button: c(/<button\b/g), input: c(/<input\b/g), select: c(/<select\b/g), textarea: c(/<textarea\b/g), form: c(/<form\b/g) }, { button: 46, input: 176, select: 24, textarea: 4, form: 0 });
  assert.equal(count(page, 'localStorage.setItem('), 2);
  assert.equal(c(/\bsafeSet\(/g), 0);
});

test('U87 every call into a billing function from an existing place sits on a typeof-guarded line', () => {
  const calls = [...withoutBlock.matchAll(/\bsvb[A-Z][A-Za-z]*\(/g)];
  assert.equal(calls.length, 11, 'hooks outside the block (P-5 to P-15, three refresh lines)');
  calls.forEach(m => {
    const name = m[0].slice(0, -1);
    const a = withoutBlock.lastIndexOf('\n', m.index) + 1;
    const line = withoutBlock.slice(a, withoutBlock.indexOf('\n', m.index));
    assert.ok(line.includes('typeof ' + name + " === 'function'"), 'guarded: ' + line.trim());
  });
  // the one place a name is used without a call: the share option, guarded too
  assert.equal(count(page, "if (typeof svbShare === 'function') o.share = svbShare;"), 1);
});

test('U88 each hook sits at its agreed place', () => {
  const at = (s) => { assert.equal(count(page, s), 1, s); return page.indexOf(s); };
  // P-5, P-6
  const showViewAt = at("  if (id === 'stores' && typeof svsShowStores === 'function') svsShowStores();\n  if (id === 'billing') { document.getElementById('btn-back-dash').style.display = ''; typeof svbShowBilling === 'function' && svbShowBilling(); }\n");
  assert.ok(showViewAt > page.indexOf('function showView('));
  at("function renderDash() {\n  typeof svsContextChanged === 'function' && svsContextChanged();\n  typeof svbContextChanged === 'function' && svbContextChanged();\n");
  // P-7, P-8, P-9
  at("  svcPaintInvoiceLockBanner();\n  typeof svsRefreshJob === 'function' && svsRefreshJob();\n  typeof svbRefreshJob === 'function' && svbRefreshJob();\n");
  at("  applyReadOnlyUI();\n  typeof svsRefreshJob === 'function' && svsRefreshJob();\n  showView('form');\n  typeof svbRefreshJob === 'function' && svbRefreshJob();\n");
  at("toast('✓ Saved — ' + (editId || id));\n  typeof svsRefreshJob === 'function' && svsRefreshJob();\n  typeof svbRefreshJob === 'function' && svbRefreshJob();\n");
  // P-10, P-11
  at("function markEstimateApproved(id) {\n  if (readOnlyGuard()) return;                 // past-view = read-only, consistent w/ quickStage/addFollowUp\n  const c = byId(id); if (!c) return;\n  if (typeof svbOpenApproval === 'function' && svbOpenApproval(id)) return;\n");
  at("function taxInvoiceById(id) {\n  const c = byId(id); if (!c) return;\n  if (typeof svbTaxInvoiceRoute === 'function' && svbTaxInvoiceRoute(id)) return;\n");
  // P-12 before readDelivery, P-13 the zero-final condition
  const closeAt = page.indexOf('function closeCase() {');
  const gate = at("  { const _bg = (typeof svbCloseGate === 'function') ? svbCloseGate(editId) : null; if (_bg && _bg.ok === false) { toast('⚠ ' + _bg.message); return; } }\n  const del = readDelivery();\n");
  assert.ok(gate > closeAt && gate > page.indexOf('d3Policy.readinessValid(d3Case)', closeAt), 'after the readiness check, before the delivery is read');
  const zero = at("  if (!(parseRupee(del.finalAmt) > 0) && !(typeof svbAllowsZeroFinal === 'function' && svbAllowsZeroFinal(editId))) {\n    toast('⚠ Enter a valid Final Amount before closing');");
  assert.ok(zero > gate);
  // P-14, P-15
  at("  if (typeof svsBlocksDelete === 'function' && svsBlocksDelete(c)) return;\n  if (typeof svbBlocksDelete === 'function' && svbBlocksDelete(c)) return;\n");
  at("(typeof svsBlocksDelete === 'function' && svsBlocksDelete(cur))) return;                 // re-check after the awaited PIN\n  if (typeof svbBlocksDelete === 'function' && svbBlocksDelete(cur)) return;\n");
  // P-16: the Phase 1 core call always gets the share
  const core = page.slice(page.indexOf('function svsCore() {'), page.indexOf('function svsHost() {'));
  assert.ok(core.includes("    const o = { adapter: SaagarServiceStoresStore.adapterFromWindow(window), now: () => new Date(), cases: { get: svsCaseView }, session: svsSession, stepUpAt: svsPinGate.at };\n    if (typeof svbShare === 'function') o.share = svbShare;\n    const made = SaagarServiceStoresCore.create(o);\n"));
  // P-17: the block sits between the INIT line and the Phase 1 glue, nothing changed after svsMount
  at('// ─── INIT ──────────────────────────────────────────────────────\n\n' + BLOCK_START);
  assert.ok(page.indexOf(BLOCK_START) < page.indexOf(PHASE1_START));
  assert.equal(count(page, 'renderDash();\napplyReadOnlyUI();\nsvsMount();\n</script>'), 1, 'nothing follows svsMount');
  assert.equal(block.includes('svsMount'), false);
});

test('U89 the billing glue block: once, deferred mount last, forbidden words absent, saveDB only in the case writers, no empty catch, function ends', () => {
  assert.equal(count(page, BLOCK_START), 1);
  assert.equal(count(page, 'BILLING GLUE'), 1);
  assert.ok(block.length > 10000);
  assert.ok(block.trimEnd().endsWith("Promise.resolve().then(function () { svbMount(); });   // after the whole script, so the Stores button already exists"), 'the deferred mount is the last statement');
  [/saagar_svcs_/, /st_v2_/, /stockDocs/, /localStorage/, /sessionStorage/, /indexedDB/, /setItem\(/, /safeSet\(/, /postMessage/, /\bST_[A-Z0-9_]+\b/, /\bimport\s*\(/, /\beval\(/, /new Function/, /\bfetch\(/,
    /XMLHttpRequest/, /window\.open/, /document\.write/, /createElement\(\s*['"]script/, /data-action|data-svcs-action/, /<button|<input|<select|<form|<textarea/, /\bprompt\(|\bconfirm\(|\balert\(/,
    /SaagarReauth|SaagarOwnerSession|isSuperAdmin|ownerOnly|ST_ACCESS_CONTEXT|SaagarAccess|accessContext|canAccess|hasPermission|requireRole|roleAllows/, /custEmail/, /svsPinGate/,
    /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/].forEach(re => assert.equal(re.test(block), false, String(re)));
  // customer fields: read in exactly one function, which one function uses
  const fnText = name => { const s = block.indexOf('function ' + name + '('); assert.ok(s >= 0, name); const e = block.indexOf('\n}\n', s); const one = block.indexOf('\n', s); return block.slice(s, e < 0 || block.slice(s, one).endsWith('}') ? one : e + 2); };
  const readers = [...block.matchAll(/^function (svb\w+)\(/gm)].map(m => m[1]).filter(n => /custName|custMobile|custAddr/.test(fnText(n)));
  assert.deepEqual(readers, ['svbFreezeBillTo']);
  const users = [...block.matchAll(/^function (svb\w+)\(/gm)].map(m => m[1]).filter(n => /svbFreezeBillTo\(/.test(fnText(n)) && n !== 'svbFreezeBillTo');
  assert.deepEqual(users.sort(), ['svbBillToForPrint', 'svbSetCaseInvoice']);
  // saveDB() callers
  const savers = [...block.matchAll(/^function (svb\w+)\(/gm)].map(m => m[1]).filter(n => /\bsaveDB\(/.test(fnText(n)));
  assert.deepEqual(savers.sort(), ['svbSetCaseApproval', 'svbSetCaseInvoice', 'svbSetCaseVoid']);
  assert.equal(/\bsaveDB\s*\(\s*\)\s*;?[^\n]*svs/i.test(page), false);
  // every top-level function ends with a lone } line, or is one line
  const names = [...block.matchAll(/^function (svb\w+)\(/gm)].map(m => m[1]);
  assert.ok(names.length >= 40);
  names.forEach(n => { const t = fnText(n); assert.ok(!t.includes('\n') || t.endsWith('\n}'), n); });
  // every Phase 1 call inside the block sits on a typeof-guarded line
  [...block.matchAll(/\bsvs[A-Z][A-Za-z]*\(/g)].forEach(m => {
    const name = m[0].slice(0, -1);
    const a = block.lastIndexOf('\n', m.index) + 1;
    const line = block.slice(a, block.indexOf('\n', m.index));
    assert.ok(line.includes('typeof ' + name + " === 'function'"), line.trim());
  });
});

test('the Phase 1 case view keeps exactly its six fields, and the new case view adds exactly two', () => {
  const s = page.slice(page.indexOf('function svsCaseView(id) {'), page.indexOf('function svsCore() {'));
  assert.deepEqual([...s.matchAll(/^    (\w+):/gm)].map(m => m[1]), ['id', 'status', 'invoiceNo', 'paymentStatus', 'stub', 'label']);
  const b = block.slice(block.indexOf('function svbCaseView('), block.indexOf('// The one place that reads the customer fields'));
  assert.deepEqual([...b.matchAll(/^    (\w+):/gm)].map(m => m[1]), ['id', 'status', 'invoiceNo', 'paymentStatus', 'stub', 'label', 'voided', 'typedAdvancePaise']);
});

test('the case list export column list is untouched and the new case field is not in it', () => {
  assert.equal(page.includes('svbBillTo'), true);
  const csv = page.slice(page.indexOf('function exportCases'), page.indexOf('function exportCases') + 6000);
  assert.equal(csv.includes('svbBillTo'), false);
});
