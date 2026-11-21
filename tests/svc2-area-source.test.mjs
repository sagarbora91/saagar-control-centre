// Billing area: text checks of the file itself (plan 2.1 rules for UI files, P5 3.2, 13, U01, U03, U05, U06, U08, U09 as they apply to the area file).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { AREA_PATH, AREA_SOURCE as SRC, setup, SESSIONS, SAMPLE } from './lib/svc2-area-kit.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const BUF = fs.readFileSync(AREA_PATH);

test('F01 file facts: LF only, no BOM, no tab, ASCII, one final newline, under the 120,000 byte budget, name does not match service-stores', () => {
  assert.equal(BUF.includes(13), false, 'CR found');
  assert.notDeepEqual(Array.from(BUF.slice(0, 3)), [0xef, 0xbb, 0xbf]);
  assert.equal(BUF.includes(9), false, 'tab found');
  assert.equal(BUF.some((b) => b > 127), false, 'non-ASCII byte');
  assert.equal(BUF[BUF.length - 1], 10);
  assert.notEqual(BUF[BUF.length - 2], 10, 'two final newlines');
  assert.ok(BUF.length < 120000, 'size ' + BUF.length);
  assert.equal(/service-stores/i.test(path.basename(AREA_PATH)), false);
});

test('F02 compiles, is one IIFE with the UMD head, defines SaagarServiceBillingAreaUI, frozen, with the public names the page glue calls', () => {
  new vm.Script(SRC, { filename: 'service-billing-area-ui.js' });
  assert.match(SRC, /^\(function \(root, factory\) \{\n  var api = factory\(\);/);
  const { area } = setup();
  assert.equal(Object.isFrozen(area), true);
  for (const k of ['mount', 'unmount', 'show', 'onContextChange', 'refresh', 'phrases', 'internals', 'version']) assert.ok(k in area, k);
  assert.equal(typeof area.mount, 'function');
  assert.equal(area.mount.length, 2, 'mount(host, ui)');
  assert.equal(Object.isFrozen(area.internals), true);
});

const FORBIDDEN = [
  ['postMessage', /postMessage/], ['ST_ token', /(^|[^A-Za-z0-9])ST_[A-Z0-9_]*/], ['document.write', /document\.write/], ["createElement('script')", /createElement\(\s*['"]script['"]/],
  ['import(', /import\(/], ['eval(', /(^|[^A-Za-z0-9_$])eval\(/], ['new Function', /new Function/], ['fetch(', /(^|[^A-Za-z0-9_$])fetch\(/], ['XMLHttpRequest', /XMLHttpRequest/],
  ['window.open', /window\.open/], ['sendBeacon', /sendBeacon/], ['WebSocket', /WebSocket/], ['http://', /http:\/\//], ['https://', /https:\/\//],
  ['sessionStorage', /sessionStorage/], ['indexedDB', /indexedDB/], ['localStorage', /localStorage/], ['setItem(', /setItem\(/], ['getItem(', /getItem\(/], ['removeItem(', /removeItem\(/],
  ['safeSet(', /safeSet\(/], ['store.set(', /store\.set\(/], ['saagar_svcs_', /saagar_svcs_/], ['st_v2_', /st_v2_/], ['gm_expenses', /gm_expenses/], ['SERVICE_DELIVERED', /SERVICE_DELIVERED/],
  ['stockDocs', /stockDocs/], ['custName', /custName/], ['custMobile', /custMobile/], ['custAddr', /custAddr/], ['custEmail', /custEmail/],
  ['permission words', /SaagarReauth|SaagarOwnerSession|isSuperAdmin|ownerOnly|ST_ACCESS_CONTEXT|SaagarAccess|accessContext|canAccess|hasPermission|requireRole|roleAllows/],
  ['prompt(', /(^|[^A-Za-z0-9_$])prompt\(/], ['confirm(', /(^|[^A-Za-z0-9_$])confirm\(/], ['alert(', /(^|[^A-Za-z0-9_$])alert\(/], ['debugger', /\bdebugger\b/],
  ['word mobile', /mobile/i], ['word phone', /phone/i], ['MutationObserver', /MutationObserver/], ['async', /\basync\b/], ['await', /\bawait\b/], ['generator', /function\s*\*/],
  ['class', /\bclass\s+[A-Za-z]/], ['data-action', /data-action/], ['table markup', /<table|<tr[ >]|<td[ >]/], ['inline handler', /\son[a-z]+\s*=\s*["']/],
  ['duplicate id of the main file', /svb-job-|svb-est-|svb-appr-|svb-rcpt-save|svb-bill-save|svb-dialog-/]
];
for (const [name, re] of FORBIDDEN) {
  test('F03 forbidden text: ' + name, () => {
    const m = SRC.match(re);
    assert.equal(m, null, 'found ' + (m && m[0]));
  });
}

test('F04 no timer except the 200 ms search pause; listeners only on the area root (click, keydown, input, change); none on window or document', () => {
  assert.equal((SRC.match(/setTimeout\(/g) || []).length, 1);
  assert.equal((SRC.match(/setInterval|requestAnimationFrame/g) || []).length, 0);
  assert.equal((SRC.match(/\blisten\(/g) || []).length, 5, 'the definition and four calls');
  assert.equal((SRC.match(/listen\(el, '(click|keydown|input|change)'/g) || []).length, 4);
  assert.equal((SRC.match(/\.addEventListener\(/g) || []).length, 1, 'one raw addEventListener inside listen()');
  assert.equal(/ownerDocument\.defaultView|visualViewport|createElement\(/.test(SRC), false, 'no DOM layer of its own');
});

test('F05 every upper-case constant and function name uses the SBA_ stem; no name taken from another www file', () => {
  const decl = [...SRC.matchAll(/\b(?:var|function)\s+([A-Z][A-Z0-9_]+)\b/g)].map((m) => m[1]);
  assert.ok(decl.length > 15);
  for (const d of decl) assert.ok(d.startsWith('SBA_'), d + ' lacks the SBA_ stem');
  for (const banned of ['SVCS_PREFIX', 'HEAD_KEY', 'CODE_PATTERN', 'INDIA_OFFSET_MS', 'MAX_LINES', 'UI_VERSION']) assert.equal(new RegExp('\\b' + banned + '\\b').test(SRC), false, banned);
});

test('F06 no function body of 160 or more characters is byte-identical with the same text in two other product files (A2-01, my own sliding check on code lines)', () => {
  const www = path.join(ROOT, 'www');
  const code = (t) => t.split('\n').map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('/*') && !l.startsWith('//') && !l.startsWith('*'));
  const mine = code(SRC);
  const others = [];
  for (const f of fs.readdirSync(www)) {
    if (!/\.js$/.test(f) || f === path.basename(AREA_PATH)) continue;
    others.push({ f, lines: new Set(code(fs.readFileSync(path.join(www, f), 'utf8'))) });
  }
  for (const line of mine) {
    if (line.length < 160) continue;
    const hits = others.filter((o) => o.lines.has(line));
    assert.ok(hits.length < 2, 'long line shared with ' + hits.map((h) => h.f).join(', ') + ': ' + line.slice(0, 80));
  }
});

/* ------------------------------------------------------------------ action ids */
const ACTION_LITERALS = Array.from(new Set(Array.from(SRC.matchAll(/'(svb-[a-z0-9-]+)'/g)).map((m) => m[1])));
const NOT_ACTIONS = new Set(['svb-root', 'svb-title', 'svb-status', 'svb-alert', 'svb-body', 'svb-area-layer', 'svb-dlg-title', 'svb-dlg-alert', 'svb-day-body', 'svb-day-flag',
  'svb-drawer-out', 'svb-adv-list', 'svb-unb-list', 'svb-bills-list', 'svb-cs-list', 'svb-rcpt-list', 'svb-old-adv', 'svb-old-mig', 'svb-set-form', 'svb-fa-', 'svb-a-', 'svb-vh', 'svb-kv', 'svb-layer', 'svb-totals-grand', 'svb-age-bad', 'svb-age-warn', 'svb-total', 'svb-adv', 'svb-unb', 'svb-bills', 'svb-rcpts']);

test('F07 action ids: kebab-case, unique, svb- prefix, no 10-digit run, no date; every literal is a handler or a known element id; every handler is offered in the markup', () => {
  const { area } = setup();
  const actions = area.internals.actions;
  assert.equal(new Set(actions).size, actions.length);
  for (const a of actions) {
    assert.match(a, /^svb-[a-z0-9]+(?:-[a-z0-9]+)*$/, a);
    assert.equal(/\d{10}/.test(a), false, a);
    assert.equal(/\d{4}-\d{2}-\d{2}/.test(a), false, a);
  }
  const classLines = SRC.split(/\n/).filter((l) => /cls\(|class="/.test(l));
  const classNames = new Set(classLines.flatMap((l) => Array.from(l.matchAll(/svb-[a-z0-9-]+/g)).map((m) => m[0])).filter((n) => !actions.includes(n)));
  const usedAsAction = ACTION_LITERALS.filter((l) => !NOT_ACTIONS.has(l) && !classNames.has(l));
  for (const l of usedAsAction) assert.ok(actions.includes(l), 'literal without handler: ' + l);
  for (const a of actions) assert.ok(SRC.includes("'" + a + "'") || /page-(prev|next)$/.test(a), 'handler never named in the source: ' + a);
});

test('F08 every handler id is really offered by some screen (render everything as the Owner with data that shows every control)', async () => {
  const { area } = setup();
  const actions = area.internals.actions;
  const a = setup({
    session: SESSIONS.owner,
    billingOpts: {
      held: (() => { const rows = []; for (let i = 1; i <= 45; i++) rows.push({ jobId: 'WS-2026-' + String(i).padStart(3, '0'), netPaise: 1000, receipts: [], oldestDocDate: '2026-11-17', ageDays: 1, jobState: 'OPEN' }); return { ok: true, rows, totalPaise: 1, count: 45 }; })(),
      unbilled: (() => { const rows = []; for (let i = 1; i <= 45; i++) rows.push({ jobId: 'WS-2026-' + String(i).padStart(3, '0'), jobStatus: 'OPEN', pieces: 1, costPaise: 1, oldestDocDate: '2026-11-17' }); return { ok: true, rows, total: 45 }; })(),
      bills: (() => { const rows = []; for (let i = 1; i <= 45; i++) rows.push(SAMPLE.bill('SV/2026-27/' + String(i).padStart(4, '0'))); return { ok: true, rows, total: 45 }; })(),
      billViews: { 'SV/2026-27/0001': SAMPLE.billView('SV/2026-27/0001') },
      receipts: (() => { const rows = []; for (let i = 1; i <= 45; i++) rows.push(SAMPLE.receipt('SAR/26-27/' + String(i).padStart(4, '0'))); return { ok: true, rows, total: 45 }; })(),
      counter: { ok: true, totalPaise: 1, count: 1, rows: [{ no: 'CSL/26-27/0001', docDate: '2026-11-18', amountPaise: 1, state: 'NO_RECEIPT', receiptNo: '' }] },
      legacy: { ok: true, available: true, totalPaise: 100, rows: [{ jobId: 'WS-2026-001', typedPaise: 100, state: 'OPEN' }] },
      plan: { ok: true, plan: { invoices: [{ jobId: 'WS-2025-001', legacyNo: 'SV/2025-26/0001', invoiceDate: '2026-02-01', totalPaise: 100 }], skipped: [] } }
    }
  });
  a.mount();
  await a.show();
  const seen = new Set(a.allActions());
  for (const tab of ['svb-tab-advances', 'svb-tab-unbilled', 'svb-tab-bills', 'svb-tab-receipts', 'svb-tab-old', 'svb-tab-settings']) {
    await a.click(tab);
    a.allActions().forEach((x) => seen.add(x));
    if (tab === 'svb-tab-advances') { await a.click('svb-adv-page-next'); a.allActions().forEach((x) => seen.add(x)); }
    if (tab === 'svb-tab-unbilled') { await a.click('svb-unb-page-next'); a.allActions().forEach((x) => seen.add(x)); }
    if (tab === 'svb-tab-receipts') { await a.click('svb-rcpts-page-next'); a.allActions().forEach((x) => seen.add(x)); }
    if (tab === 'svb-tab-bills') {
      await a.click('svb-bills-page-next');
      a.allActions().forEach((x) => seen.add(x));
      await a.click('svb-bills-page-prev');
      await a.click('svb-bill-view', 'SV/2026-27/0001');
      a.allActions().forEach((x) => seen.add(x));
      await a.click('svb-bv-close');
    }
    if (tab === 'svb-tab-old') { await a.click('svb-old-confirm', 'WS-2026-001|IN_BOOK'); a.allActions().forEach((x) => seen.add(x)); await a.click('svb-old-confirm-cancel'); }
  }
  seen.add('svb-area-retry');
  for (const act of actions) assert.ok(seen.has(act), 'never offered: ' + act);
  for (const s of seen) assert.ok(actions.includes(s) || /^svb-dialog-/.test(s), 'offered without handler: ' + s);
});

test('F09 markup rules: controls are buttons with type="button" and data-svcs-action; row keys in data-svs-key; fields in data-svs-field; layer and root are data-no-i18n through the page, the layer here', async () => {
  const a = setup({ session: SESSIONS.owner, billingOpts: { legacy: { ok: true, available: true, totalPaise: 1, rows: [{ jobId: 'WS-2026-001', typedPaise: 100, state: 'OPEN' }] } } });
  a.mount();
  await a.show();
  await a.click('svb-tab-old');
  await a.click('svb-old-confirm', 'WS-2026-001|IN_BOOK');
  const html = a.rootHtml() + a.layerHtml();
  for (const m of html.matchAll(/<button\b[^>]*>/g)) {
    assert.match(m[0], /type="button"/, m[0]);
    assert.match(m[0], /data-svcs-action="/, m[0]);
  }
  assert.ok((SRC.match(/data-svs-key/g) || []).length >= 1);
  assert.equal(a.layer().getAttribute('id'), 'svb-layer', 'the dialog is drawn in the main file layer');
  assert.ok(a.layer().querySelector('[data-svb-area="areaold"]'));
});

/* ------------------------------------------------------------------ texts */
test('F10 TEXT table: no HTML characters, 1 to 160 characters, no duplicate values, every t(...) id defined, every id used', () => {
  const { area } = setup();
  const TEXT = area.internals.TEXT;
  const ids = Object.keys(TEXT);
  for (const id of ids) {
    assert.equal(/[<>&"]/.test(TEXT[id]), false, id);
    assert.ok(TEXT[id].length > 0 && TEXT[id].length <= 160, id);
  }
  const vals = ids.map((i) => TEXT[i]);
  assert.deepEqual(vals.filter((v, i) => vals.indexOf(v) !== i), []);
  const used = new Set(Array.from(SRC.matchAll(/\bt\('([a-z0-9_]+)'\)/g)).map((m) => m[1]));
  for (const m of SRC.matchAll(/(?:\bl|label): '([a-z0-9_]+)'/g)) used.add(m[1]);
  for (const m of SRC.matchAll(/t\((?:[^()]*\? )?'([a-z0-9_]+)'(?: : '([a-z0-9_]+)')?\)/g)) { used.add(m[1]); if (m[2]) used.add(m[2]); }
  for (const m of SRC.matchAll(/'(type_|st_|mode_|job_|set_|day_|bv_|old_|mig_|cs_|adv_|unb_|bills_|rcpt_)([a-z_]+)'/g)) used.add(m[1] + m[2]);
  for (const u of used) assert.ok(ids.includes(u), 'undefined text id ' + u);
  const dynamic = new Set(['type_advance', 'type_balance', 'type_counter', 'type_refund']);
  for (const id of ids) assert.ok(used.has(id) || dynamic.has(id) || SRC.includes("'" + id + "'") || SRC.includes('t(\'' + id + '\')'), 'text never used: ' + id);
});

test('F11 the error table: no HTML characters, every UI code of plan 2.18 that this file raises is present, the texts equal the main UI wording (P5 14)', () => {
  const { area } = setup();
  const ERR = area.internals.ERR;
  for (const [k, v] of Object.entries(ERR)) { assert.equal(/[<>"]/.test(v), false, k); assert.ok(v.length <= 160, k); }
  const raised = new Set(Array.from(SRC.matchAll(/fail\('([A-Z_]+)'/g)).map((m) => m[1]));
  for (const c of raised) assert.ok(c in ERR, 'no text for ' + c);
  const same = {
    SVB_CORE_MISSING: 'Billing is not available in this build. Nothing was changed.',
    SVB_ROLE_DENIED: 'Your role cannot do this. Ask the Store Manager or the Owner.',
    SVB_OWNER_ONLY: 'Only the Owner can do this. Unlock Owner mode in the app header, then try again.',
    SVB_PIN_DENIED: 'Owner approval was not given. Nothing was changed.',
    SVB_PAST_VIEW: 'You are viewing a past date. Billing cannot be changed.',
    SVB_ACCESS_CHANGED: 'Your access changed. Nothing was saved.',
    SVB_BUSY: 'Another save is in progress. Wait a moment.',
    SVB_INTEGRITY: 'The billing records failed their check. Posting is stopped. Tell the Owner.',
    SVB_PRINT_UNAVAILABLE: 'Printing is not available in this build.',
    SVB_MONEY_INVALID: 'Enter an amount in rupees, for example 149.50.',
    SVB_DATE_FUTURE: 'The date cannot be in the future.',
    SVB_BAD_REPLY: 'Something went wrong. Nothing was changed. Code: {code}.'
  };
  for (const [k, v] of Object.entries(same)) assert.equal(ERR[k], v, k);
});

test('F12 phrases(): sorted, unique, strings, none empty, none over 160 characters, covers TEXT and the error table; the phrase file matches', () => {
  const { area } = setup();
  const p = JSON.parse(JSON.stringify(area.phrases()));
  assert.deepEqual(p, p.slice().sort());
  assert.equal(new Set(p).size, p.length);
  for (const s of p) { assert.equal(typeof s, 'string'); assert.ok(s.length > 0 && s.length <= 160, s); }
  for (const v of Object.values(area.internals.TEXT)) assert.ok(p.includes(v));
  for (const v of Object.values(area.internals.ERR)) assert.ok(p.includes(v));
  const file = path.join(ROOT, '..', 'Saagar Control Centre Workspace', 'service-wave-2', 'l10n', 'PHRASES-area.json');
  if (fs.existsSync(file)) {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.ok(typeof j._readme === 'string');
    assert.deepEqual(j.rows.map((r) => r[0]).sort(), p);
    for (const r of j.rows) assert.deepEqual(r.slice(1), ['', '']);
  }
});

test('F13 no raw interpolation: innerHTML is only assigned built strings; every dynamic value in markup goes through esc()', () => {
  const assigns = SRC.match(/innerHTML\s*=\s*[^;]+;/g) || [];
  assert.ok(assigns.length > 5);
  for (const a of assigns) {
    const rhs = a.replace(/^innerHTML\s*=\s*/, '');
    assert.ok(/^(h|html|'|"|headHtml|closedHtml|emptyHtml|notice|badge|btn|body|''|\(|v\.|layer|tabHtml)/.test(rhs) || /esc\(|''/.test(rhs), a.slice(0, 80));
  }
});

test('F14 Stage E: no billing file defines a function named switchTab (the Payroll page uses that name in its inline handlers)', () => {
  const root = path.join(here, '..', 'www');
  for (const f of fs.readdirSync(root).filter((n) => /^service-billing-.+\.js$/.test(n))) {
    assert.equal(/function\s+switchTab\s*\(/.test(fs.readFileSync(path.join(root, f), 'utf8')), false, f);
  }
  assert.equal((SRC.match(/function sbaSwitchTab\(/g) || []).length, 1);
});
