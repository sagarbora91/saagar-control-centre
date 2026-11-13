// svc1 page group: static wiring of the Service page (script tags, two containers, hooks, markers, forbidden text).
import test from 'node:test';
import assert from 'node:assert/strict';
import { page, pageBytes, STORE_FILES, glueBlock, withoutGlue, staticMarkup } from './lib/svc1-page-source.mjs';
import { extractFunction } from './lib/fix-s08-source.mjs';

const count = (s, needle) => s.split(needle).length - 1;
const head = page.slice(0, page.indexOf('</head>'));
const tag = n => '<script src="../../' + n + '.js"></script>';
const fn = name => extractFunction(name, page);

test('page: LF only, no BOM, starts with the doctype', () => {
  assert.equal(pageBytes.includes(13), false, 'no CR');
  assert.notEqual(pageBytes[0], 0xEF, 'no BOM');
  assert.ok(page.startsWith('<!DOCTYPE html>'));
});

test('page: seven Stores script tags, once each, in plan order, directly after app-i18n.js, inside head', () => {
  const i18n = '<script src="../../app-i18n.js"></script>\n';
  assert.equal(count(page, i18n), 1);
  const expected = i18n + STORE_FILES.map(n => tag(n) + '\n').join('');
  assert.ok(head.includes(expected), 'tags are consecutive lines after app-i18n.js');
  STORE_FILES.forEach(n => { assert.equal(count(page, tag(n)), 1, n); assert.ok(head.includes(tag(n)), n + ' in head'); });
  const at = STORE_FILES.map(n => page.indexOf(tag(n)));
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'order');
  assert.ok(page.indexOf('href="service-ui.css"') < page.indexOf('<script>'), 'service-ui.css before the first bare script');
  assert.equal(/<script src="[^"]*service-stores[^"]*"[^>]*(defer|\?v=)/.test(page), false, 'no defer, no ?v=');
  assert.equal(/<script src="[^"]*service-stores[^"]*\?/.test(page), false);
});

test('page: MAH-4 contract source accepts every new tag as a local script', async () => {
  const mod = await import('../scripts/lib/mah4-contract-source.mjs');
  assert.equal(typeof mod.scriptSources, 'function');
  assert.equal(typeof mod.resolveLocalScript, 'function');
  const srcs = mod.scriptSources(page).map(s => (typeof s === 'string' ? s : s.src || s.ref || ''));
  STORE_FILES.forEach(n => {
    assert.ok(srcs.some(s => s.endsWith(n + '.js')), n + ' seen by scriptSources');
    assert.equal(mod.resolveLocalScript('modules/service/index.html', '../../' + n + '.js'), n + '.js');
  });
});

test('page: exactly two static containers added, with no data-action, button, input, select or form', () => {
  assert.equal(count(page, 'id="svs-job-host"'), 1);
  assert.equal(count(page, 'id="view-stores"'), 1);
  assert.equal(count(page, 'id="svs-root"'), 1);
  assert.ok(page.includes('<div id="svs-job-host" class="svs-job-host" data-no-i18n></div>'));
  assert.ok(page.includes('<div class="view" id="view-stores" data-no-i18n><div class="svs-wrap" id="svs-root"></div></div>'));
  const hostAt = page.indexOf('id="svs-job-host"');
  assert.ok(hostAt > page.indexOf('id="sec-7"') && hostAt < page.indexOf('<!-- S8 TERMS -->'), 'job host sits in section 7');
  assert.ok(page.indexOf('id="view-stores"') < page.indexOf('<!-- PRINT TARGET -->'));
  assert.ok(page.indexOf('<!-- PRINT TARGET -->') < page.indexOf('id="view-print"'));
  ['id="svs-job-host"', 'id="view-stores"'].forEach(marker => {
    const start = page.indexOf(marker);
    const line = page.slice(page.lastIndexOf('\n', start) + 1, page.indexOf('\n', start));
    assert.equal(/data-action|<button|<input|<select|<form|<textarea|onclick/i.test(line), false, marker);
  });
  assert.equal(page.includes('btn-open-stores'), false, 'no static Stores button');
});

test('page: data-action set is untouched (91 unique static, 111 unique in the file) and the new code adds none', () => {
  const unique = text => new Set([...text.matchAll(/\bdata-action="([^"]+)"/g)].map(m => m[1]));
  assert.equal(unique(staticMarkup()).size, 91);
  assert.equal(unique(page).size, 111);
  assert.equal(unique(page).size - unique(staticMarkup()).size, 20);
  assert.equal(/data-action|data-svcs-action/.test(glueBlock()), false);
  assert.equal(count(page, 'data-action="open-stores"'), 0);
});

test('page: every call into a Stores function from an existing place is typeof-guarded', () => {
  const rest = withoutGlue();
  const calls = [...rest.matchAll(/\bsvs[A-Z][A-Za-z]*\(/g)];
  assert.ok(calls.length >= 8, 'hooks exist: ' + calls.length);
  calls.forEach(m => {
    const name = m[0].slice(0, -1);
    const a = rest.lastIndexOf('\n', m.index) + 1;
    const line = rest.slice(a, rest.indexOf('\n', m.index));
    if (name === 'svsMount' && line.trim() === 'svsMount();') return; // the one top-level mount call
    assert.ok(line.includes('typeof ' + name + " === 'function'"), 'guarded: ' + line.trim());
  });
});

test('page: each hook sits at its agreed place', () => {
  assert.ok(page.includes("(id === 'form' || id === 'stores') ? '' : 'none';\n  if (id === 'dash') renderDash();\n  if (id === 'stores' && typeof svsShowStores === 'function') svsShowStores();"));
  assert.ok(page.includes("function renderDash() {\n  typeof svsContextChanged === 'function' && svsContextChanged();\n"));
  assert.ok(page.includes("  showView('form');\n  svcPaintInvoiceLockBanner();\n  typeof svsRefreshJob === 'function' && svsRefreshJob();\n"));
  assert.ok(page.includes("  applyReadOnlyUI();\n  typeof svsRefreshJob === 'function' && svsRefreshJob();\n  showView('form');"));
  assert.ok(page.includes("toast('✓ Saved — ' + (editId || id));\n  typeof svsRefreshJob === 'function' && svsRefreshJob();\n"));
  const del = fn('delCase');
  assert.ok(del.indexOf('svcInvoiceLocked(c)') < del.indexOf('svsBlocksDelete(c)'), 'after the invoice-lock line');
  assert.ok(del.indexOf('svsBlocksDelete(c)') < del.indexOf('svcDeleteClosedWithApproval(c)'), 'before any prompt');
  const fin = fn('svcFinishDelete');
  assert.ok(fin.includes("if (!cur || svcInvoiceLocked(cur) || (typeof svsBlocksDelete === 'function' && svsBlocksDelete(cur))) return;                 // re-check after the awaited PIN"));
  assert.ok(fin.indexOf('svsBlocksDelete') < fin.indexOf('svcRecordDeletion'), 'tombstone only after the guard');
  assert.equal(count(page, '// re-check after the awaited PIN'), 1);
});

test('page: glue block exists once and the mount call follows applyReadOnlyUI', () => {
  assert.equal(count(page, '// ─── STORES GLUE'), 1);
  assert.equal(count(page, 'renderDash();\napplyReadOnlyUI();\nsvsMount();\n</script>'), 1);
  assert.ok(glueBlock().length > 1500);
});

test('page: every new top-level function ends with a line that is exactly "}" or is one line', () => {
  const names = [...glueBlock().matchAll(/^function (svs[A-Za-z]+)\(/gm)].map(m => m[1]);
  assert.deepEqual(names, ['svsUi', 'svsSession', 'svsCaseView', 'svsCore', 'svsHost', 'svsMount', 'svsShowStores', 'svsRefreshJob', 'svsContextChanged', 'svsBlocksDelete']);
  names.forEach(n => {
    const text = fn(n);
    assert.ok(!text.includes('\n') || text.endsWith('\n}'), n);
  });
});

test('page: markers and fix-wave identity strings stay', () => {
  assert.equal(count(page, 'D3-SERVICE-HTML-2026-07-30'), 1);
  assert.equal(count(page, 'D3-SERVICE-RUNTIME-2026-07-30'), 1);
  ["const STORE_KEY = 'saagar_wsf_v2'", 'function saveDB()', 'function doSave()', 'function closeCase()', 'function delCase(', 'function svcD3RenderWorkboard(',
    'function watchKey(id)', 'function watchKeyAfter(id)', 'function svcEv()'].forEach(s => assert.ok(page.includes(s), s));
  assert.equal([...page.match(/const FORM_STEPS = \[([^\]]*)\]/)[1].matchAll(/'sec-\d+'/g)].length, 12);
});

test('page: new code stays clear of forbidden things', () => {
  const g = glueBlock();
  assert.ok(g.length > 0);
  [/stockDocs/, /saagar_svcs_/, /localStorage/, /sessionStorage/, /indexedDB/, /setItem\(/, /safeSet\(/, /postMessage/, /\bST_[A-Z0-9_]+\b/,
    /custName|custMobile|custAddr|custEmail/, /\bimport\s*\(/, /\beval\(/, /new Function/, /\bfetch\(/, /XMLHttpRequest/, /window\.open/, /document\.write/,
    /createElement\(\s*['"]script/, /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/, /saveDB\(/].forEach(re => assert.equal(re.test(g), false, String(re)));
  assert.equal(page.includes('stockDocs'), false);
  assert.equal(page.includes('saagar_svcs_'), false, 'the storage prefix literal lives in the store file only');
  assert.equal(page.includes('svcStoresLinkCase'), false);
});

test('page: the pre-existing top-level functions are all still present', () => {
  ['addFollowUp', 'applyReadOnlyUI', 'assignInvoiceNo', 'buildIntakeHtml', 'calcTotal', 'closeCase', 'csvCell', 'delCase', 'doSave', 'exportCases', 'followUpDue',
    'openNew', 'pad2', 'populateForm', 'printById', 'saveDB', 'svcClearReminders', 'svcD3CommitCases', 'svcD3RenderWorkboard', 'svcDeleteClosedWithApproval', 'svcDeletedIds',
    'svcDeliveryDraftEmpty', 'svcDiffCase', 'svcFinancialYear', 'svcFinishDelete', 'svcGstValid', 'svcInvoiceDateOf', 'svcInvoiceLocked', 'svcMergeForeignCases',
    'svcRequestCorrectionApproval', 'taxInvoiceById', 'validMobile', 'showView', 'renderDash', 'openEdit'].forEach(n => {
    assert.match(page, new RegExp('function\\s+' + n + '\\s*\\('), n);
  });
});
