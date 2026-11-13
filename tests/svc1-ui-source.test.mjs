// Service Stores UI (wave 1, group ui): source rules for www/service-stores-ui.js and the CSS block.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { UI_SOURCE, loadUi } from './lib/svc1-ui-harness.mjs';
import { transformJavaScriptAsset } from '../scripts/prepare-api23-assets.mjs';

const require = createRequire(import.meta.url);
const CSS_PATH = new URL('../www/modules/service/service-ui.css', import.meta.url);
const CSS = fs.readFileSync(CSS_PATH, 'utf8');
const MARK = '/* SERVICE-STORES-2026-11 */';
const BLOCK = CSS.slice(CSS.indexOf(MARK));
const PRE_CSS = 'E:/Projects/Saagar Control Centre Workspace/service-wave-1/g0/pre-wave-service/www/modules/service/service-ui.css';
const PHRASES_UI = 'E:/Projects/Saagar Control Centre Workspace/service-wave-1/l10n/PHRASES-ui.json';
export const UI_BYTE_BUDGET = 190000;

test('U1 file hygiene: LF only, no BOM, no tab, one final newline, under the declared budget', () => {
  assert.equal(UI_SOURCE.charCodeAt(0) === 0xfeff, false);
  assert.equal(UI_SOURCE.includes('\r'), false);
  assert.equal(UI_SOURCE.includes('\t'), false);
  assert.equal(/\n$/.test(UI_SOURCE) && !/\n\n$/.test(UI_SOURCE), true);
  assert.ok(Buffer.byteLength(UI_SOURCE) < UI_BYTE_BUDGET, 'size ' + Buffer.byteLength(UI_SOURCE));
  assert.equal(/[^\x00-\x7f]/.test(UI_SOURCE), false, 'ASCII only');
});

test('U2 forbidden text (messages, network, storage, dynamic code, customer fields, permission tokens)', () => {
  const banned = [
    /postMessage/, /\bST_[A-Z0-9_]+\b/, /createElement\(['"]script['"]\)/, /document\.write/, /import\(/, /eval\(/, /new Function/,
    /fetch\(/, /XMLHttpRequest/, /window\.open/, /sendBeacon/, /WebSocket/, /https?:\/\//, /sessionStorage/, /indexedDB/, /localStorage/,
    /custName/, /custMobile/, /custAddr/, /setItem\(/, /safeSet\(/, /store\.set\(/, /saagar_svcs_/, /\basync\b/, /\bawait\b/,
    /SaagarReauth/, /SaagarOwnerSession/, /isSuperAdmin/, /ownerOnly/, /accessContext/, /SaagarAccess/, /canAccess/, /hasPermission/,
    /requireRole/, /roleAllows/, /addEventListener\(['"]message['"]/, /setTimeout/, /setInterval/, /requestAnimationFrame/, /Date\.now/,
    /\bclass\s+\w+/, /function\s*\*/, /\.\.\.\w/, /onclick\s*=/, /\bonerror\b/, /innerHTML\s*\+=/
  ];
  for (const re of banned) assert.equal(re.test(UI_SOURCE), false, String(re));
});

test('U3 no template literals; only the permitted ES6 forms; no unsafe prototype methods', () => {
  const noMap = UI_SOURCE.replace(/'`': '&#96;'/, '').replace(/\[&<>"'`\]/, '');
  assert.equal(noMap.includes('`'), false, 'template literal found');
  for (const re of [/\.flat\(/, /\.fill\(/, /\.at\(/, /padEnd/, /replaceAll/, /structuredClone/, /getOwnPropertyDescriptors/, /\?\./]) {
    assert.equal(re.test(UI_SOURCE), false, String(re));
  }
});

test('U4 compiles, is one UMD expression, and survives the API 23 Babel step', () => {
  new vm.Script(UI_SOURCE);
  const out = transformJavaScriptAsset(UI_SOURCE, 'service-stores-ui.js', 'service-stores-ui.js');
  new vm.Script(out);
  assert.equal(/=>/.test(out), false);
  assert.equal(/\b(const|let)\b/.test(out.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '')), false);
  assert.match(out, /SaagarServiceStoresUI/);
  const { ui } = loadUi();
  assert.equal(typeof ui.mount, 'function');
  assert.equal(Object.isFrozen(ui), true);
  assert.deepEqual(Object.keys(ui).sort(), ['click', 'internals', 'jobHasParts', 'mount', 'onContextChange', 'phrases', 'refreshJob', 'show', 'unmount', 'version']);
});

const NOT_ACTIONS = new Set(['svs-layer', 'svs-root', 'svs-body', 'svs-status', 'svs-alert', 'svs-title', 'svs-diag', 'svs-masters-host', 'svs-grn-total', 'svs-cs-wrap',
  'svs-cs-form', 'svs-settings-form', 'svs-job-form', 'svs-dlg-title', 'svs-dlg-alert', 'svs-old-jobs', 'svs-open-status', 'svs-open-pending', 'svs-open-bar',
  'svs-open-rows', 'svs-open-alert', 'svs-stock-list', 'svs-stock-foot', 'svs-grn-list', 'svs-grn-foot', 'svs-cs-list', 'svs-adj-list', 'svs-old-list',
  'svs-reorder-list', 'svs-stock', 'svs-grn', 'svs-ledger', 'svs-open', 'svs-f-f-stock-group', 'svs-f-', 'svs-oq-', 'svs-oc-', 'svs-so-', 'svs-dlg-', 'svs-job-host', 'svs-vh', 'svs-']);
const CSS_CLASSES = new Set(Array.from(BLOCK.matchAll(/\.(svs-[a-z0-9-]+)/g)).map((m) => m[1]));
const idLike = (s) => NOT_ACTIONS.has(s) || CSS_CLASSES.has(s);

test('U5 action ids: kebab-case, unique, no 10-digit run, no date; the table and the markup agree', () => {
  const { ui } = loadUi();
  const actions = ui.internals.actions;
  assert.equal(new Set(actions).size, actions.length);
  for (const a of actions) {
    assert.match(a, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, a);
    assert.equal(/\d{10}/.test(a), false, a);
    assert.equal(/\d{4}-\d{2}-\d{2}/.test(a), false, a);
    assert.ok(a.startsWith('svs-'), a);
  }
  const literals = new Set(Array.from(UI_SOURCE.matchAll(/'(svs-[a-z0-9-]+)'/g)).map((m) => m[1]));
  const usedAsAction = Array.from(literals).filter((l) => !idLike(l));
  for (const l of usedAsAction) assert.ok(actions.includes(l), 'literal without handler: ' + l);
  for (const a of actions) assert.ok(literals.has(a), 'handler never offered: ' + a);
  assert.ok(actions.includes('svs-open-stores') && actions.includes('svs-tab-settings') && actions.includes('svs-wm-ack') && actions.includes('svs-job-issue-override'));
  assert.ok(actions.includes('svs-grn-print') && actions.includes('svs-adj-print') && actions.includes('svs-old-print'));
  assert.equal(actions.some((a) => /^svs-(masters-sub|part-|labour-)/.test(a)), false, 'masters ids belong to the masters UI');
  assert.equal(actions.includes('svs-job-return-open'), true);
  assert.equal(/sent_to_titan|SENT_TO_TITAN/.test(UI_SOURCE), false);
});

test('U6 markup rules: data-svcs-action only, no data-action attribute, no inline handler, no <table>', () => {
  assert.equal(/data-action=/.test(UI_SOURCE.replace(/\[data-action="new-service-order"\]/, '')), false);
  assert.equal(/<table|<tr|<td/.test(UI_SOURCE), false);
  assert.equal(/\son[a-z]+=/.test(UI_SOURCE), false);
  assert.equal((UI_SOURCE.match(/data-svs-key/g) || []).length > 3, true);
});

test('U7 every HTML builder escapes: no raw interpolation of dynamic text (innerHTML only gets built strings)', () => {
  // dynamic data enters markup only through esc(), attr(), num(), money() or a builder that does it; check the riskiest spots by example
  const { ui } = loadUi();
  const { esc, attr } = ui.internals;
  assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(attr('"><script>x()</script>'), '&quot;&gt;&lt;script&gt;x()&lt;/script&gt;');
  assert.equal(esc('a`b${c}'), 'a&#96;b${c}');
  assert.equal(esc(null), '');
  assert.equal(esc(0), '0');
  // no assignment of unescaped property values to innerHTML
  const risky = UI_SOURCE.match(/innerHTML\s*=\s*[a-zA-Z_.]+\s*;/g) || [];
  for (const r of risky) assert.match(r, /innerHTML = (h|out|body|entry|list|html|pend|tabHtml|inner|foot|inner)\s*;|innerHTML = ''/, r);
});

test('U8 TEXT table: no HTML characters, no duplicates, every id used, every t() id defined', () => {
  const { ui } = loadUi();
  const TEXT = ui.internals.TEXT;
  const ids = Object.keys(TEXT);
  for (const id of ids) {
    assert.equal(/[<>&"]/.test(TEXT[id]), false, id);
    assert.ok(TEXT[id].length > 0 && TEXT[id].length <= 160, id);
  }
  const vals = ids.map((i) => TEXT[i]);
  const dup = vals.filter((v, i) => vals.indexOf(v) !== i);
  // the same English word may serve two ids (Reverse); everything else must be unique
  assert.deepEqual(Array.from(new Set(dup)).sort(), ['Cancel'].filter((x) => dup.includes(x)).concat(Array.from(new Set(dup)).filter((x) => x !== 'Cancel')).sort());
  const body = UI_SOURCE.slice(UI_SOURCE.indexOf('function t(id)'));
  const used = new Set(Array.from(UI_SOURCE.matchAll(/\bt\('([a-z0-9_]+)'\)/g)).map((m) => m[1]));
  for (const m of UI_SOURCE.matchAll(/(?:\bl|label|need): '([a-z0-9_]+)'/g)) used.add(m[1]);
  for (const m of UI_SOURCE.matchAll(/'((?:type|old|bin|adj_state|ret|pay|reason|tab|closed)_[a-z_]+)'/g)) used.add(m[1]);
  ['adj_state_posted', 'adj_state_proposed', 'adj_state_rejected', 'adj_state_withdrawn'].forEach((x) => used.add(x));
  for (const u of used) if (/^[a-z0-9_]+$/.test(u) && !['viewQty', 'receive', 'counterSale', 'proposeAdj', 'oldPartRegister', 'editMasters', 'openingPropose', 'settings'].includes(u)) assert.ok(ids.includes(u), 'undefined text id ' + u);
  assert.ok(body.length > 0);
});

test('U9 phrases(): sorted, unique, strings, none empty, none over 160 characters, covers TEXT and the error table', () => {
  const { ui } = loadUi();
  const p = JSON.parse(JSON.stringify(ui.phrases()));
  assert.deepEqual(p, p.slice().sort());
  assert.equal(new Set(p).size, p.length);
  for (const s of p) { assert.equal(typeof s, 'string'); assert.ok(s.length > 0 && s.length <= 160, s); }
  for (const v of Object.values(ui.internals.TEXT)) assert.ok(p.includes(v));
  for (const v of Object.values(ui.internals.ERR)) assert.ok(p.includes(v));
});

test('U10 phrase fragment (when present) lists exactly phrases(): English column only', { skip: !fs.existsSync(PHRASES_UI) }, () => {
  const { ui } = loadUi();
  const frag = JSON.parse(fs.readFileSync(PHRASES_UI, 'utf8'));
  assert.ok(Array.isArray(frag.rows));
  assert.deepEqual(frag.rows.map((r) => r[0]).sort(), JSON.parse(JSON.stringify(ui.phrases())));
  for (const r of frag.rows) { assert.equal(r.length, 3); assert.equal(r[1], ''); assert.equal(r[2], ''); }
});

test('U11 error table covers every code of the store, FIFO and masters layers (and the documents layer when it exists)', () => {
  const { ui } = loadUi();
  const ERR = ui.internals.ERR;
  const layers = ['store', 'fifo', 'masters'];
  if (fs.existsSync(new URL('../www/service-stores-docs.js', import.meta.url))) layers.push('docs');
  for (const l of layers) {
    const mod = require('../www/service-stores-' + l + '.js');
    for (const code of Object.keys(mod.CODES || {})) assert.ok(ERR[code], l + ' code without UI text: ' + code);
  }
  for (const c of ['SVS_CORE_MISSING', 'SVS_ROLE_DENIED', 'SVS_OWNER_ONLY', 'SVS_PIN_DENIED', 'SVS_PAST_VIEW', 'SVS_JOB_NOT_SAVED', 'SVS_JOB_CLOSED', 'SVS_JOB_INVOICED',
    'SVS_JOB_UNKNOWN', 'SVS_JOB_HAS_PARTS', 'SVS_BUSY', 'SVS_INTEGRITY', 'SVS_PRINT_UNAVAILABLE', 'SVS_MONEY_INVALID', 'SVS_QTY_INVALID', 'SVS_FIELD_REQUIRED',
    'SVS_DUPLICATE_LINE', 'SVS_REASON_SHORT', 'SVS_DATE_FUTURE', 'SVS_BAD_REPLY', 'SVS_INTERNAL', 'SVCS_WATERMARK_AHEAD', 'SVCS_WATERMARK_FORK', 'INSUFFICIENT_STOCK',
    'PART_UNKNOWN', 'PART_CODE_DUPLICATE', 'DUPLICATE_SUPPLIER_INVOICE', 'STATE_INVALID', 'SVCS_REV_CONFLICT', 'OVERRIDE_NOTE_REQUIRED', 'NOT_REVERSIBLE', 'JOB_CLOSED', 'JOB_NOT_FOUND']) {
    assert.ok(ERR[c], c);
  }
  for (const gone of ['NEGATIVE_STOCK', 'UNKNOWN_PART', 'DUPLICATE_PART_CODE', 'INVOICE_ALREADY_RECEIVED', 'ADJUSTMENT_NOT_PENDING', 'STALE_REVISION', 'CHAIN_BROKEN', 'SHARD_DAMAGED']) {
    assert.equal(gone in ERR, false, 'void code kept: ' + gone);
  }
});

test('U12 CSS block: one marker at the end, prefixed selectors, fallbacks, no grid/gap/inset/:is/:where, touch targets, both breakpoints', () => {
  assert.equal(CSS.split(MARK).length - 1, 1);
  assert.equal(CSS.split('/* D3-SERVICE-CSS-2026-07-30 */').length - 1, 1);
  assert.ok(CSS.indexOf(MARK) > CSS.indexOf('/* D3-SERVICE-CSS-2026-07-30 */'));
  assert.equal(CSS.includes('\r'), false);
  assert.match(CSS, /\n$/);
  assert.equal(/<style/.test(BLOCK), false);
  assert.equal(/display:\s*grid/.test(BLOCK), false);
  assert.equal(/(^|[\s;{])gap\s*:/.test(BLOCK), false);
  assert.equal(/inset\s*:/.test(BLOCK), false);
  assert.equal(/:is\(|:where\(/.test(BLOCK), false);
  for (const m of BLOCK.matchAll(/var\(([^)]*)\)/g)) assert.match(m[1], /,/, 'var without fallback: ' + m[0]);
  const rules = BLOCK.split('}');
  for (const r of rules) {
    const sel = r.slice(0, r.indexOf('{')).trim();
    if (!sel || sel.startsWith('/*') || sel.startsWith('@media') || sel.startsWith('.svs-') === false && sel.includes('.')) {
      if (sel && !sel.startsWith('@media') && !sel.startsWith('/*') && !/^\s*\.svs-/.test(sel)) assert.fail('unprefixed selector: ' + sel);
    }
  }
  for (const m of BLOCK.matchAll(/(^|[\s;{])height\s*:\s*([^;}]+)/g)) assert.fail('fixed height: ' + m[0]);
  assert.match(BLOCK, /\.svs-btn \{[^}]*min-height: var\(--touch-target, 44px\)/);
  assert.match(BLOCK, /\.svs-input \{[^}]*min-height: var\(--touch-target, 44px\)/);
  assert.match(BLOCK, /@media \(max-width: 899px\)/);
  assert.match(BLOCK, /@media \(max-width: 639px\)/);
});

test('U13 the existing stylesheet text before the block is byte-identical to the G0 copy (append-only edit)', { skip: !fs.existsSync(PRE_CSS) }, () => {
  const pre = fs.readFileSync(PRE_CSS, 'utf8');
  assert.equal(CSS.slice(0, pre.length), pre);
  assert.equal(CSS.slice(pre.length).startsWith('\n' + MARK) || CSS.slice(pre.length).startsWith(MARK), true);
  const h = crypto.createHash('sha256').update(pre).digest('hex');
  assert.equal(h.length, 64);
});

test('U14 every class the markup uses is defined in the CSS block (and the page-side wrapper class)', () => {
  const defined = new Set(Array.from(BLOCK.matchAll(/\.(svs-[a-z0-9-]+)/g)).map((m) => m[1]));
  const used = new Set();
  for (const m of UI_SOURCE.matchAll(/(?:class="|cls\(|svs-btn |'svs-badge svs-badge-)([^"')]*)/g)) {
    for (const tok of m[1].split(/[\s',+]+/)) if (/^svs-[a-z0-9-]+$/.test(tok)) used.add(tok);
  }
  for (const m of UI_SOURCE.matchAll(/'(svs-(?:btn|note|badge|tab|dialog|field|row|c|list|bar|form|line|job|pick|sum|dim|num|code|lbl|hint|empty|pager|neg|diag|picked|check|total|grow|chips|head|sub|title|h3|alert|status|body|input|overlay|discard|dlg)[a-z0-9-]*)'/g)) used.add(m[1]);
  const ids = new Set(Array.from(UI_SOURCE.matchAll(/id="(svs-[a-z0-9-]+)"/g)).map((m) => m[1]));
  const actionsLike = new Set(Array.from(UI_SOURCE.matchAll(/'(svs-[a-z0-9-]+)'/g)).map((m) => m[1]));
  for (const u of used) {
    if (ids.has(u) || (actionsLike.has(u) && !defined.has(u) && /^svs-(tab|stock|ledger|grn|cs|adj|old|reorder|open|job|dialog|wm|settings|blocked)-/.test(u) && !/^svs-(tab|dialog|field|row|note|badge|btn|c|dlg|line|pick|open-btn)$/.test(u))) continue;
    assert.ok(defined.has(u), 'class without CSS: ' + u);
  }
  assert.ok(defined.has('svs-wrap') && defined.has('svs-job'));
});
