// Service wave 2, W-UI: text checks for www/service-billing-ui.js, the CSS block and the Phase 1 UI hunks (P5 U01 to U10, U94 as corrected).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { UI_SOURCE, loadUi } from './lib/svc2-ui-harness.mjs';
import { transformJavaScriptAsset } from '../scripts/prepare-api23-assets.mjs';

const WWW = new URL('../www/', import.meta.url);
const CSS = fs.readFileSync(new URL('modules/service/service-ui.css', WWW), 'utf8');
const STORES_UI = fs.readFileSync(new URL('service-stores-ui.js', WWW), 'utf8');
const PAGE = fs.readFileSync(new URL('modules/service/index.html', WWW), 'utf8');
const MARK = '/* SERVICE-BILLING-2026-11 */';
const BLOCK = CSS.slice(CSS.indexOf(MARK));
const PHRASES_FILE = 'E:/Projects/Saagar Control Centre Workspace/service-wave-2/l10n/PHRASES-ui.json';

test('U01 file hygiene: LF, no BOM, no tab, ASCII, one final newline, under 190,000 bytes; CSS block under 30,000', () => {
  assert.equal(UI_SOURCE.charCodeAt(0) === 0xfeff, false);
  assert.equal(UI_SOURCE.includes('\r'), false);
  assert.equal(UI_SOURCE.includes('\t'), false);
  assert.equal(/\n$/.test(UI_SOURCE) && !/\n\n$/.test(UI_SOURCE), true);
  assert.equal(/[^\x00-\x7f]/.test(UI_SOURCE), false);
  assert.ok(Buffer.byteLength(UI_SOURCE) < 190000);
  assert.ok(Buffer.byteLength(BLOCK) < 30000);
});

test('U02 forbidden text', () => {
  const banned = [
    /postMessage/, /\bST_[A-Z0-9_]+\b/, /createElement\(['"]script['"]\)/, /document\.write/, /import\(/, /eval\(/, /new Function/, /fetch\(/, /XMLHttpRequest/,
    /window\.open/, /sendBeacon/, /WebSocket/, /https?:\/\//, /sessionStorage/, /indexedDB/, /localStorage/, /custName/, /custMobile/, /custAddr/, /custEmail/,
    /setItem\(/, /getItem\(/, /removeItem\(/, /safeSet\(/, /store\.set\(/, /saagar_svcs_/, /st_v2_/, /gm_expenses/, /SERVICE_DELIVERED/, /stockDocs/, /\basync\b/, /\bawait\b/,
    /SaagarReauth/, /SaagarOwnerSession/, /isSuperAdmin/, /ownerOnly/, /ST_ACCESS_CONTEXT/, /SaagarAccess/, /accessContext/, /canAccess/, /hasPermission/, /requireRole/, /roleAllows/,
    /setTimeout/, /setInterval/, /requestAnimationFrame/, /Date\.now/, /\bclass\s+\w+/, /function\s*\*/, /\.\.\.\w/, /onclick\s*=/, /\bonerror\b/, /innerHTML\s*\+=/,
    /\bprompt\(/, /\bconfirm\(/, /\balert\(/, /debugger/, /insertAdjacentHTML/, /outerHTML\s*=/, /MutationObserver/, /\?\./, /=>/, /\bconst\b/, /\blet\b/
  ];
  for (const re of banned) assert.equal(re.test(UI_SOURCE), false, String(re));
  const noMap = UI_SOURCE.replace("'`': '&#96;'", '').replace('[&<>"\'`]', '');
  assert.equal(noMap.includes('`'), false, 'template literal');
  for (const re of [/\.flat\(/, /\.fill\(/, /\.at\(/, /padEnd/, /replaceAll/, /structuredClone/, /\.includes\(/, /Object\.assign/]) assert.equal(re.test(UI_SOURCE), false, String(re));
});

test('U03 compiles, one IIFE, defines its global, frozen export with the contract members', () => {
  new vm.Script(UI_SOURCE);
  const { ui } = loadUi();
  assert.ok(ui && typeof ui.mount === 'function');
  assert.equal(Object.isFrozen(ui), true);
  assert.deepEqual(Object.keys(ui).sort(), ['afterCounterSale', 'allowsZeroFinal', 'blocksDelete', 'click', 'closeGate', 'internals', 'jobBilled', 'jobNoCharge', 'kit', 'mount', 'onContextChange', 'openApproval', 'phrases', 'refreshJob', 'taxInvoiceRoute', 'unmount', 'version']);
  assert.deepEqual(Object.keys(ui.kit).sort(), ['attr', 'billing', 'btn', 'closeDialog', 'dialogMessage', 'emptyHtml', 'errText', 'esc', 'exclusive', 'fill', 'fld', 'fmtAt', 'host', 'istDay', 'money', 'notice', 'num', 'openDialog', 'ownerStep', 'pagerHtml', 'parsePaise', 'parseQty', 'print', 'readSession', 'renderDialog', 'requestClose', 'rights', 'showFailure', 'today', 'badge', 'validIso', 'writeGate'].sort());
  assert.equal(Object.isFrozen(ui.kit), true);
});

test('U04 survives the API 23 Babel step', () => {
  const out = transformJavaScriptAsset(UI_SOURCE, 'service-billing-ui.js', 'service-billing-ui.js');
  new vm.Script(out);
  assert.equal(/=>/.test(out), false);
  assert.match(out, /SaagarServiceBillingUI/);
});

test('U05 action ids: kebab, svb- prefix, unique, no digits run or date, never a page data-action, every id offered in the source', () => {
  const { ui } = loadUi();
  const actions = ui.internals.actions;
  const pageActions = new Set(Array.from(PAGE.matchAll(/data-action="([^"]+)"/g)).map((m) => m[1]));
  assert.equal(new Set(actions).size, actions.length);
  for (const a of actions) {
    assert.match(a, /^svb-[a-z0-9]+(?:-[a-z0-9]+)*$/, a);
    assert.equal(/\d{10}/.test(a) || /\d{4}-\d{2}-\d{2}/.test(a), false, a);
    assert.equal(pageActions.has(a), false, a);
    assert.ok(UI_SOURCE.includes("'" + a + "'"), 'never named: ' + a);
  }
  const literals = new Set(Array.from(UI_SOURCE.matchAll(/'(svb-[a-z0-9-]+)'/g)).map((m) => m[1]));
  const NOT_ACTIONS = /^svb-(f-|pick-|layer|root|job-host|close-host|dlg-|bill-totals|est-totals|cn-total|vh|card|strip|wrap)/;
  const extra = new Set(['svb-open-billing', 'svb-dialog-close', 'svb-dialog-discard', 'svb-dialog-keep', 'svb-bill-ask-owner', 'svb-ncc-save', 'svb-ncc-cancel']);
  for (const l of literals) { if (!NOT_ACTIONS.test(l) && !/^svb-open-btn$/.test(l)) assert.ok(actions.includes(l) || l.endsWith('-page-prev') || l.endsWith('-page-next') || /^svb-(f|pick)/.test(l) || extra.has(l), 'literal without handler: ' + l); }
  for (const id of ['svb-open-billing', 'svb-job-estimate-open', 'svb-est-save', 'svb-appr-save', 'svb-rcpt-save', 'svb-bill-save', 'svb-cn-save', 'svb-ar-save', 'svb-void-save', 'svb-nc-save']) assert.ok(actions.includes(id), id);
});

test('U06 no inline handler, no data-action attribute, no table', () => {
  assert.equal(/data-action=/.test(UI_SOURCE.replace(/\[data-action="new-service-order"\]/, '')), false);
  assert.equal(/<table|<tr|<td/.test(UI_SOURCE), false);
  assert.equal(/\son[a-z]+=/.test(UI_SOURCE), false);
  assert.ok((UI_SOURCE.match(/data-svs-key/g) || []).length > 3);
});

test('U07 no customer words; phone only in the label Phone call', () => {
  assert.equal(/custName|custMobile|custAddr|custEmail|mobile/i.test(UI_SOURCE), false);
  const phones = UI_SOURCE.match(/.{0,12}phone.{0,12}/gi) || [];
  for (const p of phones) assert.match(p, /Phone call/, p);
});

test('U08 phrases(): sorted, unique, equals TEXT and ERR; no markup characters; the l10n fragment lists exactly them', () => {
  const { ui } = loadUi();
  const p = JSON.parse(JSON.stringify(ui.phrases()));
  assert.deepEqual(p, p.slice().sort());
  assert.equal(new Set(p).size, p.length);
  const union = new Set([...Object.values(ui.internals.TEXT), ...Object.values(ui.internals.ERR)]);
  assert.deepEqual(p, Array.from(union).sort());
  for (const s of p) assert.equal(/[<>&]/.test(s), false, s);
  for (const s of ['Billing for this job', 'Build estimate', 'Record approval', 'Take advance', 'Issue bill', 'Take balance', 'Add CCPT number', 'Billing at delivery', 'Credit note and refund',
    'Void job', 'No-charge warranty'.replace('No-charge warranty', 'Void job'), 'Customer approval', 'Review bill', 'Not billed in CCPT', 'Bill and receipts'.replace('Bill and receipts', 'Print bill summary'),
    'Enter the CCPT invoice number.', 'Another save is in progress. Wait a moment.', 'Owner approval was not given. Nothing was changed.']) assert.ok(p.includes(s), s);
  if (fs.existsSync(PHRASES_FILE)) {
    const j = JSON.parse(fs.readFileSync(PHRASES_FILE, 'utf8'));
    assert.deepEqual(j.rows.map((r) => r[0]), p);
    for (const r of j.rows) assert.deepEqual(r.slice(1), ['', '']);
  }
});

function functionsOf(src) {
  const out = [];
  const re = /function\s+[A-Za-z0-9_]*\s*\([^)]*\)\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) break; } }
    const body = src.slice(m.index, i + 1).replace(/\s+/g, ' ');
    if (body.length >= 160) out.push(body);
  }
  return out;
}
test('U09 no function of 160 or more characters is byte-identical to one in another product file (A2 rule)', () => {
  const mine = functionsOf(UI_SOURCE);
  assert.ok(mine.length > 50);
  for (const f of ['service-stores-ui.js', 'service-stores-masters-ui.js', 'service-billing-calc.js', 'service-billing-money.js']) {
    const other = fs.readFileSync(new URL(f, WWW), 'utf8').replace(/\s+/g, ' ');
    for (const body of mine) assert.equal(other.includes(body), false, f + ': ' + body.slice(0, 80));
  }
});

test('U10 every facade method is named in one adapter table; no direct call elsewhere', () => {
  const { ui } = loadUi();
  const names = Object.keys(ui.internals.BX).sort();
  for (const n of ['getJob', 'saveEstimate', 'recordApproval', 'prepareBill', 'previewBill', 'issueBill', 'addCcptNumber', 'cancelBill', 'issueCreditNote', 'takeReceipt', 'takeCounterReceipt', 'refund',
    'issueNoChargeSheet', 'cancelNoChargeSheet', 'voidJob', 'getBill', 'printData', 'jobHasRecords', 'closeCheck', 'taxRoute', 'status', 'can', 'activeInvoiceNo']) assert.ok(names.includes(n), n);
  const direct = new RegExp('\\.(' + names.join('|') + ')\\(');
  const body = UI_SOURCE.replace(/b\[m\]\.apply/g, '');
  const hits = body.match(direct);
  assert.equal(hits, null, 'direct call: ' + (hits && hits[0]));
});

test('U94 CSS block: marker once and last, prefix byte-identical to the pre-wave sheet, no grid/gap/inset, var fallbacks, 44 px controls, selectors in scope', () => {
  assert.equal(CSS.split(MARK).length - 1, 1);
  const prefix = CSS.slice(0, CSS.indexOf(MARK));
  assert.equal(Buffer.byteLength(prefix), 57919);
  assert.equal(crypto.createHash('sha256').update(prefix).digest('hex'), 'a747e9379781f65b6915832b48940cf7d6aa4281faceb547ddfb39a177b6ae19');
  assert.equal(/display:\s*grid|(^|[^-])gap:|inset:|:is\(|:where\(/.test(BLOCK), false);
  for (const m of BLOCK.matchAll(/var\(([^)]*)\)/g)) assert.ok(m[1].includes(','), 'fallback: ' + m[0]);
  assert.equal(/(^|[^-])height:\s*\d+px/.test(BLOCK.replace(/min-height|max-height/g, '')), false);
  assert.ok(BLOCK.includes('min-height: var(--touch-target, 44px)'));
  let open = 0;
  for (const ch of BLOCK) { if (ch === '{') open++; else if (ch === '}') open--; assert.ok(open >= 0); }
  assert.equal(open, 0);
  const selectors = Array.from(BLOCK.replace(/\/\*.*?\*\//g, '').matchAll(/(?:^|})\s*([^{}@]+)\{/gm)).map((m) => m[1].trim());
  for (const sel of selectors) for (const part of sel.split(',')) assert.match(part.trim(), /^(\.svb-|#svb-layer|html\.bcc-mobile #svb-layer|html\.bcc-mobile \.svb-)/, part);
  for (const c of new Set(Array.from(UI_SOURCE.matchAll(/svb-[a-z0-9-]+/g)).map((m) => m[0]))) void c;
  for (const cl of ['svb-card', 'svb-card-head', 'svb-next', 'svb-primary-bar', 'svb-money', 'svb-fact', 'svb-step', 'svb-more', 'svb-line', 'svb-totals', 'svb-ro', 'svb-result', 'svb-strip']) {
    assert.ok(BLOCK.includes('.' + cl), 'defined: ' + cl);
    assert.ok(UI_SOURCE.includes(cl), 'used: ' + cl);
  }
});

test('Stores hunks (plan 2.19): the new notice text, one guarded hook, size under 190,000, no new action id or TEXT key', () => {
  assert.ok(STORES_UI.includes("cs_notice: 'Counter sale money is taken as a receipt in Billing and goes to the cash book.'"));
  assert.equal(STORES_UI.includes('not posted to the Expense ledger'), false);
  assert.ok(Buffer.byteLength(STORES_UI) < 190000);
  assert.equal(STORES_UI.split('csReceiptHook(').length - 1, 2);
  assert.match(STORES_UI, /typeof ui\.afterCounterSale === 'function'/);
  assert.equal(/catch \(e\) \{\s*\}/.test(STORES_UI.slice(STORES_UI.indexOf('function csReceiptHook'), STORES_UI.indexOf('function csReceiptHook') + 600)), false);
});

test('U94b Stage E round 2 (D-tablet-3): the Billing area has the Stores side margin (16 px, 12 px on narrow screens) and date fields at most 220 px wide', () => {
  assert.ok(BLOCK.includes('.svb-wrap.svs-wrap { padding: 12px 16px 32px; }'));
  assert.ok(BLOCK.includes('@media (max-width: 899px) { .svb-wrap.svs-wrap { padding: 8px 12px 28px; } }'));
  assert.ok(BLOCK.includes('.svb-wrap .svs-input[type="date"] { max-width: 220px; }'));
  // the old zero padding stays first in the block, so the new rule (more specific and later) wins
  assert.ok(BLOCK.indexOf('.svb-wrap { padding: 0; }') < BLOCK.indexOf('.svb-wrap.svs-wrap {'));
});
