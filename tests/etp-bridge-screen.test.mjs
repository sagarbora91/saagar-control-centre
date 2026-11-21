/* ETP report-engine bridge, tablet side: the "Engine pack" screen of the ETP module (www/modules/etp/index.html).
   Owner decisions given in chat, 2026-11-12: nothing from a pack is published in this wave (Q2), no calculation changes (Q3), HEMW and the
   service store stay blocked (Q5), import by the Owner or by a Store Manager with Owner reauthentication (Q7). The throwaway test key used
   by the integration tests is generated in memory by the pack builder (non-extractable) and is never written anywhere (B-4).
   The tests run the REAL inline script of the module on a small fake DOM (tests/lib/etp-bridge-screen-dom.mjs) whose markup setters throw. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { DEFAULT_VERIFY_OPTIONS, PROFILES, buildCaseSet, buildPackDraft, generateTestKeyPair } from '../scripts/lib/etp-bridge-pack-builder.mjs';
import { verifierApi } from './lib/etp-bridge-test-support.mjs';
import { FakeFile, fakeGateway, flush, click, loadScreen, moduleHtml, mountScreen, panelMarkup, pickFile, plain, screenScript, settle, submit, tabMarkup } from './lib/etp-bridge-screen-dom.mjs';

const require = createRequire(import.meta.url);
const compareApi = require('../www/etp-bridge-compare.js');
const facadeApi = require('../www/etp-bridge-facade.js');
const lifecycle = require('../www/etp-store-lifecycle-policy.js');
const profileAuthority = require('../www/etp-profile-authority.js');
const tenderApi = require('../www/etp-tender-dictionary.js');

const HTML = moduleHtml();
const SCRIPT = screenScript(HTML);
const PANEL = panelMarkup(HTML);
const TAB = tabMarkup(HTML);
const { STR, CODE_MSG, LANGS, CATALOG_STATUS, REPORTS } = loadScreen().api;
const TOKEN = `bridge_${'a'.repeat(32)}_1`;
const CSS_LINE = HTML.split('\n').filter((line) => line.startsWith('    #panel-bridge,#panel-bridge *{'));

/* ---------- answers shaped exactly like the facade's (W2) ---------- */
const stagedAnswer = (over = {}) => ({
  ok: true, state: 'STAGED', stageToken: TOKEN, expiresInSeconds: 600,
  pack: {
    storeCode: 'WLMHW', financialYear: '2026-27', periodStart: '2026-08-01', periodEnd: '2026-08-31', scopeKey: 'WLMHW|2026-27|2026-08-01..2026-08-31', engineGeneration: 7,
    createdAtUtc: '2026-09-01T06:30:00Z', engineVersion: '1.15.0', keyId: '0123456789abcdef', exportId8: '89abcdef', finalisedThrough: '2026-08-31',
    rows: { R003: 12, R013: 34, R022: 56, R025: 78 }, figureCount: 1, checks: { signature: 'OK', hashes: 'OK', totals: 'OK', store: 'OK', period: 'OK', dictionary: 'OK' }
  },
  appliedToCalculations: false, publishes: false, ...over
});
const report = (status, over = {}) => ({
  status, reasonCodes: [], flags: [], rows: { pack: 12, tablet: 12, matched: 12, differing: 0, onlyPack: 0, onlyTablet: 0 },
  measures: [{ key: 'rowCount', pack: '12', tablet: '12' }, { key: 'net_amount', pack: '1234567.50', tablet: '1234567.50' }, { key: 'quantity', pack: '12.500', tablet: '12.500' }],
  daysDiffering: 0, differences: [], ...over
});
const comparedAnswer = (over = {}) => ({
  ok: true, state: 'COMPARED', outcome: 'DIFFERENCES', reasonCodes: [], baseline: { generation8: '0a1b2c3d' },
  counts: { reportsMatch: 3, reportsDifferent: 1, reportsCannotCompare: 0, businessRuleDifferences: 1 },
  reports: {
    R003: report('MATCH'),
    R013: report('DIFFERENCES', { measures: [{ key: 'rowCount', pack: '12', tablet: '11' }, { key: 'net_amount', pack: '-1234567.50', tablet: '99.00' }], daysDiffering: 2,
      differences: [{ date: '2026-08-03', key: 'net_amount', pack: '100.00', tablet: '99.00' }, { date: '2026-08-04', key: 'rowCount', pack: '3', tablet: '2' }] }),
    R022: report('MATCH'), R025: report('MATCH')
  },
  figures: [{ figureId: 'R022.INVOICE_COUNT', reportId: 'R022', date: null, status: 'BUSINESS_RULE_DIFFERENCE', pack: '41', tablet: '40', label: 'business-rule difference' }],
  appliedToCalculations: false, publishes: false, ...over
});
const okStatus = (access = 'OWNER', gate = 'OPEN') => ({ ok: true, gate, access, maxBytes: 33554432 });
const good = (name = 'wlmhw-2026-08.scc-etp', size = 4096) => new FakeFile({ name, size });

/* Opens the screen with an open gate, picks a good file and presses Check pack. */
async function stageVia(handlers = {}, options = {}) {
  const double = fakeGateway({ status: okStatus(options.access || 'OWNER'), stage: stagedAnswer(), compare: comparedAnswer(), ...handlers });
  const mounted = mountScreen({ gateway: double.gateway, language: options.language || 'en' });
  await mounted.started;
  const file = good();
  pickFile(mounted, file);
  submit(mounted);
  await flush();
  return { ...mounted, double, file };
}
const names = (double) => double.calls.map((call) => call.name);
const noticeText = (mounted) => mounted.text('etpBridgeNotice');

/* ======================================================================================================================== */
test('the tab is the fifth view right after Import and the panel is wired for tabs and screen readers', () => {
  assert.ok(HTML.indexOf('id="tab-import"') < HTML.indexOf('id="tab-bridge"') && HTML.indexOf('id="tab-bridge"') < HTML.indexOf('id="tab-verified"'));
  for (const attr of ['role="tab"', 'aria-controls="panel-bridge"', 'aria-selected="false"', 'data-view="bridge"', 'data-no-i18n', 'data-action="tab-bridge"', 'class="etp-tab"']) assert.ok(TAB.includes(attr), attr);
  for (const attr of ['role="tabpanel"', 'aria-labelledby="tab-bridge"', 'data-panel="bridge"', 'data-no-i18n', ' hidden>']) assert.ok(PANEL.includes(attr), attr);
  assert.ok(HTML.indexOf('id="panel-import"') < HTML.indexOf('id="panel-bridge"') && HTML.indexOf('id="panel-bridge"') < HTML.indexOf('id="panel-verified"'));
  assert.ok(HTML.includes("var VIEWS = ['import', 'bridge', 'verified', 'coverage', 'reconciliation'];"));
  assert.equal((PANEL.match(/<section/g) || []).length, 1, 'no nested section: the history helper removes the panel up to the first closing tag');
  assert.equal((HTML.match(/id="panel-bridge"/g) || []).length, 1);
  assert.equal((HTML.match(/<script id="etp-bridge-screen">/g) || []).length, 1);
  assert.equal((HTML.match(/<section class="etp-panel"/g) || []).length, 5, 'five tab panels');
});

test('exactly one engine-pack file input: one file, no multiple, no accept, no capture (the Capacitor chooser crashes on a lone unknown accept type)', () => {
  const inputs = PANEL.match(/<input[^>]*>/g) || [];
  assert.equal(inputs.length, 1);
  assert.ok(inputs[0].includes('type="file"') && inputs[0].includes('data-field="bridge-pack"') && inputs[0].includes('id="etpBridgeFile"'));
  for (const forbidden of ['multiple', 'accept', 'capture', 'webkitdirectory']) assert.ok(!new RegExp(`\\b${forbidden}\\b`).test(inputs[0]), forbidden);
  assert.equal((HTML.match(/type="file"/g) || []).length, 5, 'four XLSX report inputs plus this one');
  assert.equal((HTML.match(/type="file" multiple/g) || []).length, 4);
  assert.ok(!/\.zip/.test(PANEL + SCRIPT.replace(/[^\n]*\.scc-etp[^\n]*/g, '')), 'the pack extension is .scc-etp, never .zip');
});

test('identities: five new data-action values, one data-field, no confirm or publish control, none of the counted XLSX attributes', () => {
  const actions = [...(TAB + PANEL).matchAll(/data-action="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(actions, ['tab-bridge', 'etp-bridge-form', 'etp-bridge-check', 'etp-bridge-compare', 'etp-bridge-discard']);
  assert.deepEqual([...PANEL.matchAll(/data-field="([^"]+)"/g)].map((match) => match[1]), ['bridge-pack']);
  const all = [...HTML.matchAll(/data-action="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(all).size, all.length, 'every data-action is unique in the module');
  for (const action of actions) assert.match(action, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
  assert.doesNotMatch(TAB + PANEL, /data-etp-scope|data-etp-file|data-etp-active-scope|data-etp-verified-refresh|data-etp-scope-picker/);
  assert.doesNotMatch(TAB + PANEL, /confirm|publish|apply|adopt/i, 'Wave 6 has no control that confirms, publishes, applies or adopts anything');
  assert.deepEqual([...PANEL.matchAll(/<button\b[^>]*>/g)].map((match) => /data-action="([^"]+)"/.exec(match[0])[1]), ['etp-bridge-check', 'etp-bridge-compare', 'etp-bridge-discard']);
});

test('the added CSS is one line that follows the house rules and uses no new saagar- class', () => {
  assert.equal(CSS_LINE.length, 1);
  assert.doesNotMatch(CSS_LINE[0], /100vw|overflow-x\s*:\s*(?:auto|scroll)/);
  for (const rule of ['overflow-wrap:anywhere', '#panel-bridge [hidden]{display:none}', ':focus-within{outline:3px solid', '@media(max-width:680px)', 'html.saagar-legacy-webview .etp-b-row{display:block}', 'minmax(0,1fr)']) {
    assert.ok(CSS_LINE[0].includes(rule), rule);
  }
  const added = TAB + PANEL + SCRIPT + CSS_LINE[0];
  assert.doesNotMatch(added.replace(/html\.saagar-legacy-webview/g, ''), /saagar-/, 'only the existing legacy marker may appear');
  assert.doesNotMatch(HTML, /module-components\.css|module-responsive\.css/);
  assert.ok(/\.action\{min-height:44px/.test(HTML), 'all buttons reuse the 44 px action class');
  assert.ok(/class="action primary" id="etpBridgeCheck"/.test(PANEL));
});

/* ======================================================================================================================== */
const PLACEHOLDER = /\{[a-z0-9]+\}/g;
const LATIN_ONLY = new Set(['ms_bhim_upi_amount', 'ms_phonepe_amount', 'ms_paytm_amount', 'ms_razorpay_amount', 'ms_bharatpe_amount']);
const PUBLISH_ALLOWED = new Set(['lead', 'nIdle', 'nChecking', 'nStaged', 'cmpInfo', 'xlsxNote', 'm_nobase', 'gateWhy']);

test('the words are in English, Marathi and Hindi, labelled TEST_ONLY_UNAPPROVED, with the same keys and placeholders', () => {
  assert.equal(CATALOG_STATUS, 'TEST_ONLY_UNAPPROVED');
  assert.deepEqual([...LANGS], ['en', 'mr', 'hi']);
  const keys = Object.keys(STR.en).sort();
  assert.ok(keys.length > 120);
  for (const language of ['mr', 'hi']) assert.deepEqual(Object.keys(STR[language]).sort(), keys, language);
  for (const key of keys) {
    const placeholders = (STR.en[key].match(PLACEHOLDER) || []).sort();
    for (const language of LANGS) {
      const value = STR[language][key];
      assert.equal(typeof value, 'string', `${language}.${key}`);
      assert.ok(value.length > 0 && value === value.trim(), `${language}.${key} is non-empty and trimmed`);
      assert.deepEqual((value.match(PLACEHOLDER) || []).sort(), placeholders, `${language}.${key} placeholders`);
      assert.doesNotMatch(value, /[<>]|https?:|\/\/|[\u0000-\u001f]/, `${language}.${key} carries no markup, URL or control character`);
    }
    if (!LATIN_ONLY.has(key)) {
      for (const language of ['mr', 'hi']) {
        assert.notEqual(STR[language][key], STR.en[key], `${language}.${key} is translated`);
        assert.match(STR[language][key], /[ऀ-ॿ]/, `${language}.${key} is in Devanagari`);
      }
    }
  }
});

test('wording rules: the word publish only in negations and the Wave 6 sentences; the engine is never called approved or adopted; no 2111-phrase dictionary change', () => {
  for (const key of Object.keys(STR.en)) {
    const english = STR.en[key];
    if (/publish/i.test(english)) assert.ok(PUBLISH_ALLOWED.has(key), `${key} may not use the word publish`);
    assert.doesNotMatch(english, /approved source|adopted|adopt |applied to|is now the source|replaces the XLSX/i, key);
  }
  for (const key of PUBLISH_ALLOWED) {
    assert.match(STR.en[key], /nothing is published|no figure|No XLSX import has been published|Publishing still uses|nothing from an engine pack is read or published|Nothing is published|nothing is published/i, key);
  }
  assert.match(STR.en.gateWhy, /trust gate is closed/);
  assert.match(STR.en.gateWhy, /No trusted Owner key is installed/);
  assert.match(STR.en.gateWhy, /XLSX import on the Import tab stays the only source/);
  assert.match(STR.en.cmpInfo, /no Control Centre figure has changed/);
  assert.match(STR.en.figNote, /No Control Centre figure, incentive or payroll amount has changed/);
  assert.match(STR.en.xlsxNote, /One source is used for each store and period/);
});

test('every refusal code of the verifier, the compare module and the facade has a plain reason in all three languages (no stale code, none missing)', () => {
  const required = [...verifierApi.CODES, ...compareApi.CODES, ...facadeApi.CODES, 'ETP_BRIDGE_RESPONSE_INVALID', 'ETP_BRIDGE_VERIFY_FAILED', 'ETP_BRIDGE_FILE_INVALID',
    'ETP_ACCESS_DENIED', 'ETP_REIMPORT_REQUIRED', 'ETP_HEMW_PROFILE_AUTHORIZATION_REQUIRED'];
  assert.equal(verifierApi.CODES.length, 31);
  assert.equal(compareApi.CODES.length, 18);
  assert.equal(facadeApi.CODES.length, 9);
  for (const code of required) {
    assert.ok(Object.prototype.hasOwnProperty.call(CODE_MSG, code), `no wording for ${code}`);
    for (const language of LANGS) assert.ok(STR[language][CODE_MSG[code]], `${language} wording for ${code}`);
  }
  assert.deepEqual(Object.keys(CODE_MSG).filter((code) => !required.includes(code)), [], 'no wording for a code that does not exist');
  const used = new Set(Object.values(CODE_MSG));
  for (const key of Object.keys(STR.en).filter((item) => item.startsWith('m_'))) assert.ok(used.has(key), `${key} is used by at least one code`);
  for (const key of used) assert.match(STR.en[key], /[.]$/, `${key} is a sentence`);
  for (const code of ['ETP_BRIDGE_ARCHIVE_INVALID', 'ETP_BRIDGE_ROLLBACK_REFUSED', 'ETP_BRIDGE_DICTIONARY_MISMATCH']) assert.ok(!(code in CODE_MSG), `${code} does not exist in Wave 6`);
  assert.match(STR.en[CODE_MSG.ETP_BRIDGE_STORE_REFUSED], /Only WLMHW packs/);
  assert.match(STR.en[CODE_MSG.ETP_BRIDGE_STORE_HEMW_BLOCKED], /HEMW stays blocked/);
  assert.equal(CODE_MSG.ETP_HEMW_PROFILE_AUTHORIZATION_REQUIRED, CODE_MSG.ETP_BRIDGE_STORE_HEMW_BLOCKED);
});

/* ======================================================================================================================== */
test('source rules: no markup building, storage, network, parent window, message listener, timers, observers or file reading in the screen script', () => {
  const forbidden = [/innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new\s+Function/, /\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /FileReader/, /arrayBuffer/,
    /createObjectURL/, /localStorage/, /sessionStorage/, /indexedDB/, /window\.parent/, /Capacitor/, /postMessage/, /addEventListener/, /removeEventListener/, /ST_LANG/, /MessageChannel/,
    /BroadcastChannel/, /createElement\(\s*['"]script/, /\bimport\s*\(/, /SaagarReauth/, /SaagarOwnerSession/, /saagar-/, /setTimeout|setInterval|requestAnimationFrame/, /MutationObserver/,
    /navigator\.(?:share|clipboard)/, /\.download\s*=/, /SaagarEtp/, /window\.open|location\.|history\./, /\.stream\s*\(|\.text\s*\(|\.slice\s*\(\s*0\s*,\s*\d+\s*\)\s*\.arrayBuffer/];
  for (const pattern of forbidden) assert.doesNotMatch(SCRIPT, pattern, String(pattern));
  assert.match(SCRIPT, /SaagarModuleBridge\.etpBridgeGateway/);
  assert.deepEqual([...new Set(SCRIPT.match(/SaagarModuleBridge\.\w+/g))], ['SaagarModuleBridge.etpBridgeGateway'], 'the facade getter is the only bridge member read');
  assert.doesNotMatch(HTML, /bridge\.etpGateway/);
  assert.equal((SCRIPT.match(/<\/script/gi) || []).length, 0);
  for (const match of SCRIPT.matchAll(/catch\s*\(([^)]*)\)\s*\{([^}]*)\}/g)) assert.ok(match[2].trim() !== '', 'a catch block must assign or return an explicit result');
  assert.doesNotMatch(SCRIPT, /\bcatch\s*\(\s*\w*\s*\)\s*\{\s*\}/);
  // the screen reads only the name and the size of the picked file
  assert.deepEqual([...new Set([...SCRIPT.matchAll(/\bfile\.(\w+)/g)].map((match) => match[1]))].sort(), ['name', 'size']);
  // all handlers are on-properties of the screen's own elements (the frozen MAH-4 listener inventory does not move)
  for (const handler of ['onclick', 'onchange', 'onsubmit', 'onfocus']) assert.match(SCRIPT, new RegExp(`\\.${handler}\\s*=`));
});

test('the module HTML does not name the verifier, the trust file, the compare module or the facade global; static text is empty skeleton filled from the table', () => {
  assert.doesNotMatch(TAB + PANEL + SCRIPT, /SaagarEtpBridge|etp-bridge-[a-z-]+.js|trustedKeys|publicKeyHex/);
  const visible = PANEL.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  assert.equal(visible, '!', 'the only static text is the decorative mark of the access card; every sentence comes from the three-language table');
});

/* ======================================================================================================================== */
test('shipped configuration: gate closed shows that the bridge is not enabled and why, the picker is disabled and stage is never called', async () => {
  const double = fakeGateway();
  const mounted = mountScreen({ gateway: double.gateway });
  await mounted.started;
  assert.deepEqual(names(double), ['status']);
  assert.equal(mounted.$('etpBridgeGate').hidden, false);
  assert.equal(mounted.text('etpBridgeGateTitle'), 'Engine packs are switched off');
  assert.match(mounted.text('etpBridgeGateText'), /trust gate is closed.*No trusted Owner key is installed/);
  assert.equal(mounted.text('etpBridgeGateCode'), 'GATE-ETP-BRIDGE-TRUST');
  assert.equal(mounted.$('etpBridgeFile').disabled, true);
  assert.equal(mounted.$('etpBridgeCheck').disabled, true);
  assert.equal(mounted.$('etpBridgeStaged').hidden, true);
  assert.equal(mounted.$('etpBridgeResult').hidden, true);
  assert.equal(noticeText(mounted), STR.en.nOff);
  assert.equal(mounted.text('tab-bridge'), 'Engine pack');
  // every way of trying to start a check does nothing
  const file = good();
  pickFile(mounted, file);
  assert.equal(mounted.$('etpBridgeFile').value, '', 'a pick while closed is cleared');
  assert.equal(submit(mounted), 1, 'the form submit is always cancelled');
  mounted.screen.check();
  click(mounted, 'etpBridgeCompareBtn');
  click(mounted, 'etpBridgeDiscard');
  await flush();
  assert.deepEqual(names(double), ['status'], 'stage, compare and discard are never called');
  assert.deepEqual(file.reads, []);
  assert.equal(mounted.screen.snapshot().phase, 'idle');
  for (const language of ['mr', 'hi']) {
    mounted.setLanguage(language);
    mounted.screen.render();
    assert.equal(mounted.text('etpBridgeGateTitle'), STR[language].gateTitle);
    assert.equal(mounted.text('etpBridgeGateText'), STR[language].gateWhy);
    assert.equal(mounted.text('etpBridgeGateCode'), 'GATE-ETP-BRIDGE-TRUST', 'the gate name stays Latin');
  }
  assert.deepEqual(names(double), ['status'], 'a language change makes no facade call');
});

test('role not allowed, gateway missing, gateway failing, unexpected answers and a status that never arrives', async () => {
  const denied = mountScreen({ gateway: fakeGateway({ status: okStatus('DENIED') }).gateway });
  await denied.started;
  assert.equal(denied.text('etpBridgeGateTitle'), STR.en.deniedTitle);
  assert.equal(denied.text('etpBridgeGateText'), STR.en.deniedText);
  assert.equal(denied.$('etpBridgeFile').disabled, true);
  const closedAndDenied = mountScreen({ gateway: fakeGateway({ status: okStatus('DENIED', 'CLOSED') }).gateway });
  await closedAndDenied.started;
  assert.equal(closedAndDenied.text('etpBridgeGateTitle'), STR.en.gateTitle, 'the closed gate is the first thing explained');

  const missing = mountScreen({ gateway: null });
  await missing.started;
  assert.equal(missing.text('etpBridgeGateTitle'), STR.en.unavailTitle);
  assert.equal(missing.text('etpBridgeGateCode'), 'ETP_BRIDGE_UNAVAILABLE');
  assert.equal(missing.text('etpBridgeGateText'), STR.en[CODE_MSG.ETP_BRIDGE_UNAVAILABLE]);
  assert.equal(missing.$('etpBridgeFile').disabled, true);

  const throwing = mountScreen({ gateway: fakeGateway({ status: () => { throw new Error('boom <b>x</b>'); } }).gateway });
  await throwing.started;
  assert.equal(throwing.text('etpBridgeGateCode'), 'ETP_BRIDGE_VERIFY_FAILED');
  assert.ok(!throwing.text('etpBridgeGateText').includes('boom'));
  const rejecting = mountScreen({ gateway: fakeGateway({ status: () => Promise.reject(new Error('nope')) }).gateway });
  await rejecting.started;
  assert.equal(rejecting.text('etpBridgeGateCode'), 'ETP_BRIDGE_VERIFY_FAILED');

  for (const answer of [{ ok: true }, { ok: true, gate: 'OPEN', access: 'OWNER', maxBytes: 99999999999 }, { ok: true, gate: 'MAYBE', access: 'OWNER', maxBytes: 5 }, 'text', null, [], { ok: true, gate: 'OPEN', access: 'ROOT', maxBytes: 5 }]) {
    const odd = mountScreen({ gateway: fakeGateway({ status: answer }).gateway });
    await odd.started;
    assert.equal(odd.text('etpBridgeGateCode'), 'ETP_BRIDGE_RESPONSE_INVALID', JSON.stringify(answer));
    assert.equal(odd.$('etpBridgeFile').disabled, true);
  }
  const odd = mountScreen({ gateway: fakeGateway({ status: { ok: false, code: '<img src=x onerror=alert(1)>', stage: 'STATUS' } }).gateway });
  await odd.started;
  assert.equal(odd.text('etpBridgeGateCode'), 'ETP_BRIDGE_VERIFY_FAILED', 'an unsafe code is replaced, never shown');

  const never = mountScreen({ gateway: fakeGateway({ status: () => new Promise(() => {}) }).gateway });
  assert.equal(never.$('etpBridgeFile').disabled, true);
  assert.equal(noticeText(never), STR.en.nStatus);
  assert.equal(never.$('etpBridgeGate').hidden, true);
});

test('ready for the Owner and for a Store Manager (Owner approval hint); the picker opens and Check waits for a good file', async () => {
  const owner = mountScreen({ gateway: fakeGateway({ status: okStatus('OWNER') }).gateway });
  await owner.started;
  assert.equal(owner.$('etpBridgeGate').hidden, true);
  assert.equal(owner.$('etpBridgeFile').disabled, false);
  assert.equal(owner.$('etpBridgeCheck').disabled, true);
  assert.equal(noticeText(owner), STR.en.nIdle);
  assert.equal(owner.text('etpBridgeFileName'), STR.en.pickHint);
  const manager = mountScreen({ gateway: fakeGateway({ status: okStatus('REAUTH') }).gateway });
  await manager.started;
  assert.equal(noticeText(manager), `${STR.en.nIdle} ${STR.en.nReauth}`);
  pickFile(manager, good('Pack.SCC-ETP', 33554432));
  assert.equal(manager.$('etpBridgeCheck').disabled, false);
  assert.equal(manager.text('etpBridgeFileName'), 'Selected: Pack.SCC-ETP (32.0 MB)');
});

test('file pre-check: a wrong name, an empty or oversize file gives zero facade calls and the File is never read', async () => {
  const cases = [
    ['pack.zip', 1000, 'ETP_BRIDGE_FILE_INVALID'], ['pack.scc-etp.exe', 1000, 'ETP_BRIDGE_FILE_INVALID'], ['scc-etp', 1000, 'ETP_BRIDGE_FILE_INVALID'], ['pack.scc-etp', 0, 'ETP_BRIDGE_FILE_INVALID'],
    ['pack.scc-etp', -5, 'ETP_BRIDGE_FILE_INVALID'], ['pack.scc-etp', 12.5, 'ETP_BRIDGE_FILE_INVALID'], ['pack.scc-etp', NaN, 'ETP_BRIDGE_FILE_INVALID'], ['pack.scc-etp', Infinity, 'ETP_BRIDGE_FILE_INVALID'],
    ['pack.scc-etp', '1000', 'ETP_BRIDGE_FILE_INVALID'], [null, 1000, 'ETP_BRIDGE_FILE_INVALID'], ['pack.scc-etp ', 1000, 'ETP_BRIDGE_FILE_INVALID'],
    ['pack.scc-etp', 33554433, 'ETP_BRIDGE_FILE_TOO_LARGE'], ['pack.scc-etp', 2 ** 40, 'ETP_BRIDGE_FILE_TOO_LARGE']
  ];
  for (const [name, size, code] of cases) {
    const double = fakeGateway({ status: okStatus() });
    const mounted = mountScreen({ gateway: double.gateway });
    await mounted.started;
    const file = new FakeFile({ name, size });
    pickFile(mounted, file);
    await flush();
    assert.deepEqual(names(double), ['status'], `${name}/${size}: no facade call`);
    assert.deepEqual(file.reads, [], `${name}/${size}: the file was never read`);
    assert.equal(mounted.$('etpBridgeCheck').disabled, true);
    assert.equal(mounted.$('etpBridgeFile').value, '', 'the input is cleared');
    assert.match(mounted.$('etpBridgeNotice').className, /\berror\b/);
    assert.equal(mounted.$('etpBridgeNotice').getAttribute('role'), 'alert');
    assert.equal(noticeText(mounted), `${STR.en[CODE_MSG[code]]} (${code})`);
    assert.equal(mounted.document.activeElement, mounted.$('etpBridgeNotice'));
    submit(mounted);
    await flush();
    assert.deepEqual(names(double), ['status'], 'even a forced submit does not call stage');
  }
  // a file object whose properties throw or whose selection has two files
  const double = fakeGateway({ status: okStatus() });
  const mounted = mountScreen({ gateway: double.gateway });
  await mounted.started;
  const hostile = {}; Object.defineProperty(hostile, 'name', { get() { throw new Error('x'); } });
  pickFile(mounted, hostile);
  assert.match(noticeText(mounted), /\(ETP_BRIDGE_FILE_INVALID\)$/);
  const input = mounted.$('etpBridgeFile'); input.files = [good(), good()]; input.onchange({});
  assert.match(noticeText(mounted), /\(ETP_BRIDGE_FILE_INVALID\)$/);
  // the status limit lowers the maximum
  const small = fakeGateway({ status: { ok: true, gate: 'OPEN', access: 'OWNER', maxBytes: 1000 } });
  const limited = mountScreen({ gateway: small.gateway });
  await limited.started;
  pickFile(limited, good('a.scc-etp', 1001));
  assert.match(noticeText(limited), /\(ETP_BRIDGE_FILE_TOO_LARGE\)$/);
  pickFile(limited, good('a.scc-etp', 1000));
  assert.equal(limited.$('etpBridgeCheck').disabled, false);
  assert.deepEqual(names(small), ['status']);
});

test('the success path: status, stage, compare, discard, in order, with exact requests, the checked-pack facts, and nothing published', async () => {
  const mounted = await stageVia({ discard: { ok: true, state: 'DISCARDED' } });
  const { double, file } = mounted;
  assert.deepEqual(names(double), ['status', 'stage']);
  const stage = double.calls[1].request;
  assert.deepEqual(Object.keys(stage), ['file']);
  assert.equal(stage.file, file, 'the very File object goes to the facade, unread');
  assert.deepEqual(file.reads, []);
  assert.equal(mounted.screen.snapshot().phase, 'staged');
  assert.equal(mounted.$('etpBridgeFile').value, '', 'the input is cleared after the check');
  assert.ok(file.name.endsWith('.scc-etp'));
  assert.equal(mounted.$('etpBridgeFile').disabled, true, 'one pack at a time: the picker stays closed until discard');
  assert.equal(mounted.$('etpBridgeStaged').hidden, false);
  assert.equal(mounted.$('etpBridgeResult').hidden, true);
  assert.equal(noticeText(mounted), STR.en.nStaged);
  assert.equal(mounted.document.activeElement, mounted.$('etpBridgeStagedTitle'));
  const facts = mounted.$('etpBridgeFacts').textContent;
  for (const piece of ['WLMHW', '2026-27', '2026-08-01 – 2026-08-31', '7', '2026-09-01T06:30:00Z', '1.15.0', '2026-08-31', '0123456789abcdef', '89abcdef']) assert.ok(facts.includes(piece), piece);
  assert.equal(mounted.$('etpBridgeRows').textContent, 'R00312 rowsR01334 rowsR02256 rowsR02578 rows');
  assert.equal(mounted.$('etpBridgeChecks').children.length, 6);
  assert.equal(mounted.$('etpBridgeChecks').textContent, ['Signature valid', 'File fingerprints match', 'Row totals equal engine totals', 'Store accepted', 'Period complete', 'Payment-type list matches'].map((label) => `${label}OK ✓`).join(''));
  assert.equal(mounted.$('etpBridgeCompareBtn').disabled, false);
  assert.equal(mounted.$('etpBridgeDiscard').disabled, false);
  assert.equal(mounted.$('panel-bridge').getAttribute('aria-busy'), 'false');

  click(mounted, 'etpBridgeCompareBtn');
  assert.equal(mounted.screen.snapshot().phase, 'comparing');
  assert.equal(mounted.$('panel-bridge').getAttribute('aria-busy'), 'true');
  assert.equal(mounted.$('etpBridgeCompareBtn').disabled, true);
  assert.equal(mounted.$('etpBridgeDiscard').disabled, true);
  assert.equal(noticeText(mounted), STR.en.nComparing);
  await flush();
  assert.deepEqual(plain(double.calls[2]), { name: 'compare', request: { stageToken: TOKEN } });
  assert.equal(mounted.$('etpBridgeResult').hidden, false);
  assert.equal(mounted.document.activeElement, mounted.$('etpBridgeResultTitle'));
  assert.equal(mounted.$('etpBridgeCompareBtn').disabled, false, 'the comparison can be repeated');
  const body = mounted.$('etpBridgeResultBody').textContent;
  assert.ok(body.includes('Compared with the XLSX import, generation 0a1b2c3d.'));
  assert.ok(body.includes('Differences found'));
  assert.ok(body.includes('1 of 4 reports differ.'));
  assert.ok(body.includes('Differences are information only. Nothing is published and no Control Centre figure has changed.'));
  assert.ok(body.includes('12,34,567.50'), 'Indian grouping of money');
  assert.ok(body.includes('-12,34,567.50'));
  assert.ok(body.includes('12.500'), 'quantities are shown as given');
  assert.ok(body.includes('2 days differ'));
  assert.ok(body.includes('2026-08-03 - Net amount - engine pack 100.00 - XLSX import 99.00'));
  assert.ok(body.includes('2026-08-04 - Rows - engine pack 3 - XLSX import 2'));
  assert.ok(body.includes('Figures per ETP Reporting Engine'));
  assert.ok(body.includes('Invoice count (proposed rule: same-day cancelled bills left out)'));
  assert.ok(body.includes('whole period - engine pack 41 - XLSX import 40 - business-rule difference (shown only)'));
  assert.ok(body.includes('No Control Centre figure, incentive or payroll amount has changed.'));
  assert.ok(!/approved source|adopted/i.test(body));

  click(mounted, 'etpBridgeDiscard');
  assert.equal(mounted.screen.snapshot().phase, 'discarding');
  assert.equal(mounted.$('etpBridgeResult').hidden, true, 'the comparison card is hidden as soon as the pack is being discarded');
  assert.equal(mounted.$('etpBridgeStaged').hidden, false);
  await flush();
  assert.deepEqual(plain(double.calls[3]), { name: 'discard', request: { stageToken: TOKEN } });
  assert.equal(names(double)[4], 'status', 'the status is read again after a discard');
  assert.equal(mounted.screen.snapshot().phase, 'idle');
  assert.equal(mounted.$('etpBridgeStaged').hidden, true);
  assert.equal(mounted.$('etpBridgeResult').hidden, true);
  assert.equal(noticeText(mounted), STR.en.nDiscarded);
  assert.equal(mounted.$('etpBridgeFile').disabled, false);
  assert.equal(mounted.document.activeElement, mounted.$('etpBridgeFile'));
  assert.equal(mounted.screen.snapshot().token, '');
});

test('every stage refusal code is worded in all three languages: a plain reason, then the code in Latin, as an alert, with nothing staged and the picker open again', async () => {
  const codes = Object.keys(CODE_MSG);
  for (const code of codes) {
    for (const language of LANGS) {
      const mounted = await stageVia({ stage: { ok: false, code, stage: 'VERIFY' } }, { language });
      const notice = mounted.$('etpBridgeNotice');
      assert.equal(notice.textContent, `${STR[language][CODE_MSG[code]]} (${code})`, `${language} ${code}`);
      assert.equal(notice.getAttribute('role'), 'alert');
      assert.match(notice.className, /\berror\b/);
      assert.equal(notice.children.find((child) => child.tagName === 'code').textContent, code);
      assert.equal(notice.children.find((child) => child.tagName === 'code').getAttribute('lang'), 'en');
      assert.equal(mounted.$('etpBridgeStaged').hidden, true);
      assert.equal(mounted.screen.snapshot().phase, 'idle');
      assert.equal(mounted.$('etpBridgeFile').value, '');
      assert.equal(mounted.document.activeElement, notice);
    }
  }
  const mounted = await stageVia({ stage: { ok: false, code: 'ETP_BRIDGE_ROW_INVALID', stage: 'VERIFY', check: 'ROWS', report: 'R013', field: 'net_amount', line: 12 } });
  assert.equal(mounted.$('etpBridgeNotice').textContent, `${STR.en.m_row} (ETP_BRIDGE_ROW_INVALID)Where: R013 / net_amount / line 12`);
  const hostile = await stageVia({ stage: { ok: false, code: 'ETP_BRIDGE_ROW_INVALID', stage: 'VERIFY', report: '<b>R013</b>', field: 'a b<script>', line: -4 } });
  assert.equal(hostile.$('etpBridgeNotice').textContent, `${STR.en.m_row} (ETP_BRIDGE_ROW_INVALID)`, 'unsafe detail fields are dropped');
  const unknown = await stageVia({ stage: { ok: false, code: 'ETP_SOMETHING_NEW', stage: 'X' } });
  assert.equal(unknown.$('etpBridgeNotice').textContent, `${STR.en.m_internal} (ETP_SOMETHING_NEW)`, 'an unknown safe ETP_ code gets the generic sentence and keeps its code');
  const weird = await stageVia({ stage: { ok: false, code: 'not a code', stage: 'X' } });
  assert.equal(weird.$('etpBridgeNotice').textContent, `${STR.en.m_internal} (ETP_BRIDGE_VERIFY_FAILED)`);
});

test('unexpected stage answers become ETP_BRIDGE_RESPONSE_INVALID and nothing is staged', async () => {
  const wrong = [
    null, 'ok', [], {}, { ok: true }, stagedAnswer({ state: 'COMPARED' }), stagedAnswer({ stageToken: 'bridge_x' }), stagedAnswer({ stageToken: `${TOKEN}<` }), stagedAnswer({ publishes: true }),
    stagedAnswer({ appliedToCalculations: true }), stagedAnswer({ appliedToCalculations: undefined }), stagedAnswer({ pack: null }), stagedAnswer({ pack: { ...stagedAnswer().pack, storeCode: '<img onerror=x>' } }),
    stagedAnswer({ pack: { ...stagedAnswer().pack, keyId: 'ABCDEF0123456789' } }), stagedAnswer({ pack: { ...stagedAnswer().pack, engineGeneration: '7' } }),
    stagedAnswer({ pack: { ...stagedAnswer().pack, rows: { R003: 1, R013: 2, R022: 3 } } }), stagedAnswer({ pack: { ...stagedAnswer().pack, rows: { R003: '1', R013: 2, R022: 3, R025: 4 } } }),
    stagedAnswer({ pack: { ...stagedAnswer().pack, checks: { ...stagedAnswer().pack.checks, totals: 'FAILED' } } }), stagedAnswer({ pack: { ...stagedAnswer().pack, checks: { signature: 'OK' } } }),
    stagedAnswer({ pack: { ...stagedAnswer().pack, createdAtUtc: '2026-09-01' } }), stagedAnswer({ pack: { ...stagedAnswer().pack, engineVersion: '1.15' } })
  ];
  for (const answer of wrong) {
    const mounted = await stageVia({ stage: answer });
    assert.equal(mounted.$('etpBridgeNotice').textContent, `${STR.en.m_response} (ETP_BRIDGE_RESPONSE_INVALID)`, JSON.stringify(answer));
    assert.equal(mounted.$('etpBridgeStaged').hidden, true);
    assert.equal(mounted.screen.snapshot().staged, false);
  }
  for (const stage of [() => { throw new Error('x'); }, () => Promise.reject(new Error('y'))]) {
    const mounted = await stageVia({ stage });
    assert.equal(mounted.$('etpBridgeNotice').textContent, `${STR.en.m_internal} (ETP_BRIDGE_VERIFY_FAILED)`);
  }
  const saved = Object.getOwnPropertyDescriptor(Object.prototype, 'ok');
  Object.prototype.ok = true;
  try {
    const mounted = await stageVia({ stage: {} });
    assert.equal(mounted.screen.snapshot().staged, false, 'an inherited ok is not an answer');
    assert.match(noticeText(mounted), /ETP_BRIDGE_RESPONSE_INVALID/);
  } finally { if (saved) Object.defineProperty(Object.prototype, 'ok', saved); else delete Object.prototype.ok; }
});

test('compare outcomes: MATCH, differences, cannot compare (no XLSX import is information, not an error), reasons, notes and the 20-line cap', async () => {
  const match = await stageVia({ compare: comparedAnswer({ outcome: 'MATCH', reports: { R003: report('MATCH'), R013: report('MATCH'), R022: report('MATCH'), R025: report('MATCH') }, figures: [] }) });
  click(match, 'etpBridgeCompareBtn'); await flush();
  assert.ok(match.$('etpBridgeResultBody').textContent.includes('MATCH'));
  assert.ok(match.$('etpBridgeResultBody').textContent.includes('All four reports match.'));

  const none = await stageVia({ compare: comparedAnswer({ outcome: 'CANNOT_COMPARE', reasonCodes: ['ETP_BRIDGE_COMPARE_NO_TABLET_GENERATION'], baseline: { generation8: null },
    reports: Object.fromEntries(REPORTS.map((id) => [id, { status: 'CANNOT_COMPARE', reasonCodes: [], flags: [], rows: {}, measures: [], daysDiffering: 0, differences: [] }])), figures: [] }) });
  click(none, 'etpBridgeCompareBtn'); await flush();
  const text = none.$('etpBridgeResultBody').textContent;
  assert.ok(text.includes('Cannot compare'));
  assert.ok(text.includes(`${STR.en.m_nobase} (ETP_BRIDGE_COMPARE_NO_TABLET_GENERATION)`));
  assert.ok(!text.includes('Compared with the XLSX import, generation'));
  const info = none.$('etpBridgeResultBody').children.find((child) => /\bnotice\b/.test(child.className));
  assert.ok(info && !/\berror\b/.test(info.className), 'not red');
  assert.equal(none.$('etpBridgeStaged').hidden, false, 'the checked pack stays for a later compare');

  const reasons = await stageVia({ compare: comparedAnswer({ outcome: 'CANNOT_COMPARE', reasonCodes: ['ETP_BRIDGE_COMPARE_SCOPE_MISMATCH'],
    reports: { R003: report('CANNOT_COMPARE', { reasonCodes: ['ETP_BRIDGE_COMPARE_TXN_TYPE_UNKNOWN', 'ETP_BRIDGE_COMPARE_ROW_VALUE_UNPARSEABLE'], measures: [] }), R013: report('MATCH', { flags: ['ETP_BRIDGE_COMPARE_PAIRING_AMBIGUOUS', 'ETP_BRIDGE_COMPARE_DAYS_TRUNCATED'] }), R022: report('MATCH'), R025: report('MATCH') }, figures: [] }) });
  click(reasons, 'etpBridgeCompareBtn'); await flush();
  const why = reasons.$('etpBridgeResultBody').textContent;
  for (const code of ['ETP_BRIDGE_COMPARE_SCOPE_MISMATCH', 'ETP_BRIDGE_COMPARE_TXN_TYPE_UNKNOWN', 'ETP_BRIDGE_COMPARE_ROW_VALUE_UNPARSEABLE', 'ETP_BRIDGE_COMPARE_PAIRING_AMBIGUOUS', 'ETP_BRIDGE_COMPARE_DAYS_TRUNCATED']) {
    assert.ok(why.includes(`${STR.en[CODE_MSG[code]]} (${code})`), code);
  }
  assert.ok(why.includes('The reports could not be compared.'));

  const many = Array.from({ length: 20 }, (_, index) => ({ date: `2026-08-${String(index + 1).padStart(2, '0')}`, key: 'net_amount', pack: '2.00', tablet: '1.00' }));
  const capped = await stageVia({ compare: comparedAnswer({ reports: { R003: report('DIFFERENCES', { daysDiffering: 31, differences: many }), R013: report('MATCH'), R022: report('MATCH'), R025: report('MATCH') }, figures: [] }) });
  click(capped, 'etpBridgeCompareBtn'); await flush();
  assert.ok(capped.$('etpBridgeResultBody').textContent.includes('Only the first 20 differences are listed. 31 days differ in total.'));
  const lines = []; capped.$('etpBridgeResultBody').walk((node) => { if (node.tagName === 'li') lines.push(node); });
  assert.equal(lines.length, 20);
});

test('unexpected compare answers become ETP_BRIDGE_RESPONSE_INVALID, keep the checked pack, and show nothing from the answer', async () => {
  const base = comparedAnswer();
  const wrong = [
    null, {}, { ok: true }, comparedAnswer({ state: 'STAGED' }), comparedAnswer({ appliedToCalculations: true }), comparedAnswer({ publishes: true }), comparedAnswer({ outcome: 'ADOPTED' }),
    comparedAnswer({ reasonCodes: ['not a code'] }), comparedAnswer({ reasonCodes: 'ETP_X' }), comparedAnswer({ baseline: { generation8: 'XYZ' } }), comparedAnswer({ baseline: null }),
    comparedAnswer({ reports: { R003: base.reports.R003, R013: base.reports.R013, R022: base.reports.R022 } }),
    comparedAnswer({ reports: { ...base.reports, R999: base.reports.R003 } }),
    comparedAnswer({ reports: { ...base.reports, R003: report('MATCH', { measures: [{ key: 'rowCount', pack: '<b>1</b>', tablet: '1' }] }) } }),
    comparedAnswer({ reports: { ...base.reports, R003: report('MATCH', { measures: [{ key: 'net amount', pack: '1.00', tablet: '1.00' }] }) } }),
    comparedAnswer({ reports: { ...base.reports, R003: report('MATCH', { measures: [{ key: 'net_amount', pack: '1.5', tablet: '1.00' }] }) } }),
    comparedAnswer({ reports: { ...base.reports, R003: report('SOMETIMES') } }),
    comparedAnswer({ reports: { ...base.reports, R003: report('MATCH', { daysDiffering: -1 }) } }),
    comparedAnswer({ reports: { ...base.reports, R003: report('DIFFERENCES', { differences: Array.from({ length: 21 }, () => ({ date: '2026-08-01', key: 'rowCount', pack: '1', tablet: '2' })) }) } }),
    comparedAnswer({ reports: { ...base.reports, R003: report('DIFFERENCES', { differences: [{ date: '01/08/2026', key: 'rowCount', pack: '1', tablet: '2' }] }) } }),
    comparedAnswer({ figures: [{ figureId: '<x>', reportId: 'R022', date: null, status: 'MATCH', pack: '1', tablet: '1' }] }),
    comparedAnswer({ figures: [{ figureId: 'R022.INVOICE_COUNT', reportId: 'R099', date: null, status: 'MATCH', pack: '1', tablet: '1' }] }),
    comparedAnswer({ figures: [{ figureId: 'R022.INVOICE_COUNT', reportId: 'R022', date: null, status: 'APPROVED', pack: '1', tablet: '1' }] }),
    comparedAnswer({ figures: [{ figureId: 'R022.INVOICE_COUNT', reportId: 'R022', date: null, status: 'MATCH', pack: '1.5', tablet: '1' }] })
  ];
  for (const answer of wrong) {
    const mounted = await stageVia({ compare: answer });
    click(mounted, 'etpBridgeCompareBtn');
    await flush();
    assert.equal(mounted.$('etpBridgeNotice').textContent, `${STR.en.m_response} (ETP_BRIDGE_RESPONSE_INVALID)`, JSON.stringify(answer)?.slice(0, 120));
    assert.equal(mounted.$('etpBridgeResult').hidden, true);
    assert.equal(mounted.$('etpBridgeStaged').hidden, false, 'the checked pack stays');
    assert.equal(mounted.$('etpBridgeCompareBtn').disabled, false);
  }
});

test('compare refusals: a lost or closed pack drops the checked-pack card and reopens the picker; other refusals keep it', async () => {
  const lost = await stageVia({ compare: { ok: false, code: 'ETP_BRIDGE_STAGE_INVALID', stage: 'COMPARE' } });
  click(lost, 'etpBridgeCompareBtn'); await flush();
  assert.equal(lost.$('etpBridgeNotice').textContent, `${STR.en.m_stale} (ETP_BRIDGE_STAGE_INVALID)`);
  assert.equal(lost.$('etpBridgeStaged').hidden, true);
  assert.equal(lost.screen.snapshot().token, '');
  assert.equal(lost.$('etpBridgeFile').disabled, false);

  const closed = await stageVia({ compare: { ok: false, code: 'ETP_BRIDGE_TRUST_GATE_CLOSED', stage: 'GATE' }, status: (request, count) => (count > 2 ? okStatus('OWNER', 'CLOSED') : okStatus('OWNER', 'OPEN')) });
  click(closed, 'etpBridgeCompareBtn'); await flush();
  assert.equal(closed.$('etpBridgeStaged').hidden, true);
  assert.equal(closed.$('etpBridgeGate').hidden, false, 'the status is read again and the gate card appears');
  assert.equal(closed.$('etpBridgeFile').disabled, true);

  for (const code of ['ETP_REIMPORT_REQUIRED', 'ETP_BRIDGE_COMPARE_FAILED', 'ETP_ACCESS_DENIED', 'ETP_BRIDGE_BUSY', 'ETP_VERIFIED_READ_FAILED']) {
    const kept = await stageVia({ compare: { ok: false, code, stage: 'COMPARE' } });
    click(kept, 'etpBridgeCompareBtn'); await flush();
    assert.equal(kept.$('etpBridgeNotice').textContent, `${STR.en[CODE_MSG[code] || 'm_internal']} (${code})`, code);
    assert.equal(kept.$('etpBridgeStaged').hidden, false);
    assert.equal(kept.$('etpBridgeCompareBtn').disabled, false);
    assert.equal(kept.$('etpBridgeDiscard').disabled, false);
    assert.equal(kept.screen.snapshot().token, TOKEN);
  }
});

test('discard: local state is cleared even if the facade refuses, and a refusal is shown with its code', async () => {
  const mounted = await stageVia({ discard: { ok: false, code: 'ETP_BRIDGE_REQUEST_INVALID', stage: 'DISCARD' } });
  click(mounted, 'etpBridgeDiscard'); await flush();
  assert.equal(mounted.screen.snapshot().phase, 'idle');
  assert.equal(mounted.screen.snapshot().token, '');
  assert.equal(mounted.$('etpBridgeNotice').textContent, `${STR.en.m_request} (ETP_BRIDGE_REQUEST_INVALID)`);
  const odd = await stageVia({ discard: { ok: true, state: 'SOMETHING' } });
  click(odd, 'etpBridgeDiscard'); await flush();
  assert.equal(odd.$('etpBridgeNotice').textContent, `${STR.en.m_response} (ETP_BRIDGE_RESPONSE_INVALID)`);
});

/* ======================================================================================================================== */
test('double tap and stale answers: one job at a time, the newest answer wins, and a pack staged after the screen closed is discarded', async () => {
  // a double tap on Check pack calls stage once
  const releases = [];
  const slow = fakeGateway({ status: okStatus(), stage: () => new Promise((resolve) => releases.push(() => resolve(stagedAnswer()))) });
  const mounted = mountScreen({ gateway: slow.gateway });
  await mounted.started;
  pickFile(mounted, good());
  submit(mounted); submit(mounted); mounted.screen.check();
  assert.equal(slow.calls.filter((call) => call.name === 'stage').length, 1);
  for (const id of ['etpBridgeFile', 'etpBridgeCheck', 'etpBridgeCompareBtn', 'etpBridgeDiscard']) assert.equal(mounted.$(id).disabled, true, `${id} is disabled while checking`);
  assert.equal(mounted.$('panel-bridge').getAttribute('aria-busy'), 'true');
  releases.shift()(); await flush();
  assert.equal(mounted.screen.snapshot().phase, 'staged');

  // double tap on compare and on discard
  let compares = 0, discards = 0;
  const twice = await stageVia({ compare: () => { compares += 1; return comparedAnswer(); }, discard: () => { discards += 1; return { ok: true, state: 'DISCARDED' }; } });
  click(twice, 'etpBridgeCompareBtn'); click(twice, 'etpBridgeCompareBtn'); await flush();
  click(twice, 'etpBridgeDiscard'); click(twice, 'etpBridgeDiscard'); await flush();
  assert.equal(compares, 1);
  assert.equal(discards, 1);

  // two status reads in flight: the later one wins even if the earlier answers last
  const waiting = [];
  const racing = fakeGateway({ status: (request, count) => (count === 1 ? okStatus() : new Promise((resolve) => waiting.push(resolve))) });
  const race = mountScreen({ gateway: racing.gateway });
  await race.started;
  const first = race.screen.refreshStatus(), second = race.screen.refreshStatus();
  waiting[1](okStatus('OWNER', 'CLOSED')); await second;
  assert.equal(race.screen.snapshot().access, 'closed');
  waiting[0](okStatus('OWNER', 'OPEN')); await first;
  assert.equal(race.screen.snapshot().access, 'closed', 'the stale answer is dropped');

  // a pack staged after the screen was destroyed is discarded again and never shown
  const late = [];
  const closing = fakeGateway({ status: okStatus(), stage: () => new Promise((resolve) => late.push(resolve)) });
  const gone = mountScreen({ gateway: closing.gateway });
  await gone.started;
  pickFile(gone, good());
  submit(gone);
  const closed = gone.screen.destroy();
  late[0](stagedAnswer()); await flush(); await closed;
  assert.deepEqual(plain(closing.calls.filter((call) => call.name === 'discard').map((call) => call.request)), [{ stageToken: TOKEN }]);
  assert.equal(gone.$('etpBridgeStaged').hidden, true);
  assert.equal(gone.screen.snapshot().lastCleanup.ok, true);
});

test('destroy releases the staged pack once and returns the facade answer; closing the page does the same; a failure is reported with a code', async () => {
  const mounted = await stageVia();
  assert.equal(typeof mounted.win.onpagehide, 'function');
  const result = await mounted.screen.destroy();
  assert.deepEqual(plain(result), { ok: true, code: '' });
  assert.deepEqual(plain(mounted.double.calls.filter((call) => call.name === 'discard').map((call) => call.request)), [{ stageToken: TOKEN }]);
  assert.deepEqual(plain(await mounted.screen.destroy()), { ok: true, code: '' });
  assert.equal(mounted.double.calls.filter((call) => call.name === 'discard').length, 1);
  click(mounted, 'etpBridgeCompareBtn'); submit(mounted); await flush();
  assert.equal(mounted.double.calls.filter((call) => call.name === 'compare').length, 0, 'a destroyed screen does nothing');

  const page = await stageVia();
  page.win.onpagehide(); await flush();
  assert.equal(page.double.calls.filter((call) => call.name === 'discard').length, 1);

  const failing = await stageVia({ discard: { ok: false, code: 'ETP_BRIDGE_REQUEST_INVALID', stage: 'DISCARD' } });
  assert.deepEqual(plain(await failing.screen.destroy()), { ok: false, code: 'ETP_BRIDGE_REQUEST_INVALID' });
  const throwing = await stageVia({ discard: () => { throw new Error('x'); } });
  assert.deepEqual(plain(await throwing.screen.destroy()), { ok: false, code: 'ETP_BRIDGE_VERIFY_FAILED' });
  const idle = mountScreen({ gateway: fakeGateway({ status: okStatus() }).gateway });
  await idle.started;
  assert.deepEqual(plain(await idle.screen.destroy()), { ok: true, code: '' }, 'nothing staged: nothing to discard');
});

test('showing the tab reads the status again (gate and role are fresh when the user arrives), but never while a job is running', async () => {
  let gate = 'CLOSED';
  const double = fakeGateway({ status: () => okStatus('OWNER', gate) });
  const mounted = mountScreen({ gateway: double.gateway });
  await mounted.started;
  assert.equal(mounted.$('etpBridgeFile').disabled, true);
  gate = 'OPEN';
  click(mounted, 'tab-bridge'); await flush();
  assert.equal(mounted.$('etpBridgeFile').disabled, false);
  assert.equal(mounted.$('etpBridgeGate').hidden, true);
  mounted.$('tab-bridge').onfocus({}); await flush();
  assert.equal(names(double).filter((name) => name === 'status').length, 3);
  const before = names(double).length;
  pickFile(mounted, good()); submit(mounted);
  click(mounted, 'tab-bridge');
  assert.equal(names(double).length, before + 1, 'only the stage call was added while checking');
  await flush();
});

test('language: switching re-renders every state in Marathi and Hindi without any facade call; codes and key IDs stay Latin', async () => {
  const mounted = await stageVia();
  click(mounted, 'etpBridgeCompareBtn'); await flush();
  const calls = mounted.double.calls.length;
  const seen = {};
  for (const language of ['mr', 'hi', 'en']) {
    mounted.setLanguage(language);
    mounted.screen.render();
    seen[language] = mounted.$('panel-bridge').textContent;
    assert.equal(mounted.text('tab-bridge'), STR[language].tab);
    assert.equal(mounted.text('etpBridgeStagedTitle'), STR[language].stagedTitle);
    assert.equal(mounted.text('etpBridgeCheck'), STR[language].btnCheck);
    assert.equal(mounted.text('etpBridgeCompareBtn'), STR[language].btnCompare);
    assert.equal(mounted.text('etpBridgeDiscard'), STR[language].btnDiscard);
    assert.equal(mounted.text('etpBridgeResultTitle'), STR[language].cmpTitle);
    assert.equal(mounted.text('etpBridgeHeading'), STR[language].heading);
    const body = mounted.$('etpBridgeResultBody').textContent;
    assert.ok(body.includes(STR[language].figNote));
    assert.ok(body.includes(language === 'en' ? 'Differences found' : STR[language].stDiff));
    assert.ok(mounted.$('etpBridgeFacts').textContent.includes('0123456789abcdef'));
    assert.ok(mounted.$('etpBridgeFacts').textContent.includes('WLMHW'));
  }
  assert.notEqual(seen.mr, seen.en);
  assert.notEqual(seen.hi, seen.en);
  assert.notEqual(seen.mr, seen.hi);
  assert.match(seen.mr, /[ऀ-ॿ]/); assert.match(seen.hi, /[ऀ-ॿ]/);
  assert.equal(mounted.double.calls.length, calls, 'no facade call for a language change');
  mounted.setLanguage('xx');
  mounted.screen.render();
  assert.equal(mounted.text('etpBridgeHeading'), STR.en.heading, 'an unknown language falls back to English');
  const marathiDouble = fakeGateway({ status: okStatus() });
  const marathi = mountScreen({ gateway: marathiDouble.gateway, language: 'mr' });
  await marathi.started;
  assert.equal(noticeText(marathi), STR.mr.nIdle);
});

test('focus moves to the notice, the checked-pack heading, the comparison heading or the picker, and live regions use alert only for refusals', async () => {
  const refused = await stageVia({ stage: { ok: false, code: 'ETP_BRIDGE_SIGNATURE_INVALID', stage: 'VERIFY' } });
  assert.equal(refused.document.activeElement.id, 'etpBridgeNotice');
  assert.equal(refused.$('etpBridgeNotice').getAttribute('role'), 'alert');
  assert.equal(refused.$('etpBridgeNotice').getAttribute('aria-live'), 'assertive');
  const staged = await stageVia();
  assert.equal(staged.document.activeElement.id, 'etpBridgeStagedTitle');
  assert.equal(staged.$('etpBridgeNotice').getAttribute('role'), 'status');
  assert.equal(staged.$('etpBridgeNotice').getAttribute('aria-live'), 'polite');
  assert.equal(staged.$('etpBridgeStagedTitle').getAttribute('tabindex'), '-1');
  assert.equal(staged.$('etpBridgeNotice').getAttribute('tabindex'), '-1');
  assert.equal(staged.$('etpBridgeResultTitle').getAttribute('tabindex'), '-1');
  assert.equal(staged.$('etpBridgeGate').getAttribute('role'), 'status');
});

/* ======================================================================================================================== */
test('markup injection: hostile strings in the file name and in every answer field are shown as text only, never as an element or an attribute', async () => {
  const hostile = '<img src=x onerror=alert(1)>"\'><script>alert(2)</script>&amp;' + String.fromCharCode(0x202e, 0) + '.scc-etp';
  const mounted = await stageVia({}, {});
  // a second screen with the hostile name (innerHTML, outerHTML, insertAdjacentHTML and document.write all throw in the fake DOM)
  const double = fakeGateway({ status: okStatus(), stage: stagedAnswer(), compare: comparedAnswer() });
  const injected = mountScreen({ gateway: double.gateway });
  await injected.started;
  const file = new FakeFile({ name: hostile + 'x'.repeat(200) + '.scc-etp', size: 5000 });
  pickFile(injected, file);
  const shown = injected.text('etpBridgeFileName');
  assert.ok(shown.includes('<img src=x onerror=alert(1)>'), 'the text is shown literally');
  assert.ok(!/[\x00-\x1f]/.test(shown) && !shown.includes(String.fromCharCode(0x202e)), 'bidi and control characters are removed from the display');
  assert.ok(shown.length <= 'Selected:  ()'.length + 80 + 12);
  submit(injected); await flush();
  click(injected, 'etpBridgeCompareBtn'); await flush();
  const allowed = new Set(['div', 'small', 'strong', 'span', 'code', 'li', 'ul', 'ol', 'h4', 'h5', 'p']);
  for (const doc of [injected.document, mounted.document]) {
    for (const node of doc.created) {
      assert.ok(allowed.has(node.tagName), `unexpected element created: ${node.tagName}`);
      assert.deepEqual(Object.keys(node.attrs).filter((name) => !['lang', 'aria-hidden', 'data-label'].includes(name)), [], 'no attribute but the fixed ones is ever set on a created element');
    }
  }
  assert.equal(injected.document.created.filter((node) => node.tagName === 'img' || node.tagName === 'script').length, 0);
  // hostile text in answers is refused by the field checks before it can be drawn
  for (const [label, answer] of [
    ['store', stagedAnswer({ pack: { ...stagedAnswer().pack, storeCode: '<img src=x onerror=1>' } })],
    ['version', stagedAnswer({ pack: { ...stagedAnswer().pack, engineVersion: '<b>1.0.0' } })],
    ['export', stagedAnswer({ pack: { ...stagedAnswer().pack, exportId8: '"><svg/on' } })]
  ]) {
    const refused = await stageVia({ stage: answer });
    assert.match(refused.text('etpBridgeNotice'), /ETP_BRIDGE_RESPONSE_INVALID/, label);
    assert.ok(!refused.document.body.textContent.includes('<'), label);
  }
  const code = await stageVia({ stage: { ok: false, code: 'ETP_X"><img src=x onerror=1>', stage: 'VERIFY' } });
  assert.equal(code.text('etpBridgeNotice'), `${STR.en.m_internal} (ETP_BRIDGE_VERIFY_FAILED)`);
  assert.ok(!code.document.body.textContent.includes('<'));
  assert.throws(() => { injected.$('etpBridgeNotice').innerHTML = '<b>x</b>'; }, /innerHTML must not be used/);
  assert.throws(() => injected.$('etpBridgeNotice').insertAdjacentHTML('beforeend', 'x'), /insertAdjacentHTML/);
});

/* ======================================================================================================================== */
/* Integration: the screen against the REAL facade, the REAL verifier (throwaway test key, generated in memory, non-extractable, never written)
   and the REAL compare module, with the XLSX side served by a fake read gateway. */
const NOW = Date.parse('2026-09-01T10:00:00Z');
const keyPair = await generateTestKeyPair();
const trusted = verifierApi.create({ trustedKeys: [keyPair.anchor], crypto: webcrypto });
const shipped = verifierApi.create({});
const monthDraft = await buildPackDraft({ keyPair, profile: 'month' });
const monthRows = PROFILES.month().rows;
const SCOPE_KEY = 'WLMHW|2026-27|2026-08-01..2026-08-31';
const GEN = `etp_${'a'.repeat(32)}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

function makeRoot({ owner = true, role = 'Store Manager', canOpen = true, reauth = async () => true } = {}) {
  const state = { reauthCalls: 0, audit: [] };
  return {
    state,
    root: {
      SaagarOwnerSession: { read: () => Object.freeze({ version: 1, isOwner: owner, role: owner ? 'Owner' : role, isManager: owner || role === 'Store Manager' }) },
      roleCanOpen: () => canOpen,
      SaagarReauth: (...args) => { state.reauthCalls += 1; return reauth(...args); },
      auditLog: (action, detail) => { state.audit.push([action, clone(detail)]); }
    }
  };
}
function readGateway(rows) {
  const tokens = new Map(); let counter = 0;
  return {
    readVerified: async (scope, request) => {
      if (rows === null) return { ok: false, code: 'ETP_RECEIPT_NOT_FOUND', stage: 'READ' };
      const all = rows[request.reportId], index = request.cursor === null ? 0 : tokens.get(request.cursor);
      if (index === undefined) return { ok: false, code: 'ETP_READ_CURSOR_INVALID', stage: 'READ' };
      const slice = all.slice(index, index + request.limit), more = index + slice.length < all.length;
      let next = null;
      if (more) { counter += 1; next = `cur_${counter}`; tokens.set(next, index + slice.length); }
      return { ok: true, page: { scopeKey: SCOPE_KEY, generationId: GEN, reportId: request.reportId, rows: slice.map((row) => Object.fromEntries(request.fields.map((field) => [field, row[field]]))), hasMore: more, nextCursor: next } };
    },
    readFacade: { loadSummary: async () => ({ ok: true, summaries: Object.fromEntries(REPORTS.map((id) => [id, { rowCount: rows[id].length }])) }) }
  };
}
function realFacade({ verifier = trusted, bundle = makeRoot(), rows = monthRows, now = () => NOW } = {}) {
  return facadeApi.create({ verifier, compare: compareApi, gateway: readGateway(rows), lifecycle, profileAuthority, tenderDictionary: tenderApi, root: bundle.root, now, random: (bytes) => webcrypto.getRandomValues(bytes) });
}
class PackFile {
  constructor(bytes, name = 'wlmhw-2026-08.scc-etp') {
    this.name = name; this.size = bytes.length; this.reads = 0; this.bytes = bytes;
  }
  async arrayBuffer() { this.reads += 1; return this.bytes.buffer.slice(this.bytes.byteOffset, this.bytes.byteOffset + this.bytes.byteLength); }
}

test('integration, shipped configuration: the real facade answers CLOSED, the screen explains it, and the pack bytes are never read', async () => {
  for (const owner of [true, false]) {
    const mounted = mountScreen({ gateway: realFacade({ verifier: shipped, bundle: makeRoot({ owner }) }) });
    await mounted.started;
    assert.equal(mounted.text('etpBridgeGateTitle'), 'Engine packs are switched off');
    assert.equal(mounted.text('etpBridgeGateCode'), 'GATE-ETP-BRIDGE-TRUST');
    assert.equal(mounted.$('etpBridgeFile').disabled, true);
    const file = new PackFile(monthDraft.bytes);
    pickFile(mounted, file); submit(mounted); mounted.screen.check();
    await settle(mounted);
    assert.equal(file.reads, 0);
  }
});

test('integration, throwaway test key: check, compare (MATCH with the proposed invoice-count rule shown beside it), discard, and the old token is dead', async () => {
  const bundle = makeRoot();
  const facade = realFacade({ bundle });
  const mounted = mountScreen({ gateway: facade });
  await mounted.started;
  assert.equal(mounted.$('etpBridgeFile').disabled, false, 'the test key opens the gate for this test only');
  const file = new PackFile(monthDraft.bytes);
  pickFile(mounted, file); submit(mounted); await settle(mounted);
  assert.equal(file.reads, 1, 'the facade read the bytes exactly once; the screen never did');
  assert.equal(mounted.screen.snapshot().phase, 'staged', noticeText(mounted));
  assert.ok(mounted.$('etpBridgeFacts').textContent.includes(keyPair.anchor.keyId));
  assert.ok(mounted.$('etpBridgeFacts').textContent.includes('WLMHW'));
  assert.equal(mounted.$('etpBridgeChecks').children.length, 6);
  const token = mounted.screen.snapshot().token;
  click(mounted, 'etpBridgeCompareBtn'); await settle(mounted);
  const body = mounted.$('etpBridgeResultBody').textContent;
  assert.ok(body.includes('All four reports match.'), body.slice(0, 300));
  assert.ok(body.includes('Figures per ETP Reporting Engine'));
  assert.ok(body.includes('business-rule difference (shown only)'));
  assert.ok(body.includes(`generation ${GEN.substring(4, 12)}.`));
  assert.ok(!/approved source|adopted/i.test(body));
  click(mounted, 'etpBridgeDiscard'); await settle(mounted);
  assert.equal(mounted.screen.snapshot().phase, 'idle');
  assert.deepEqual((await facade.compare({ stageToken: token })).code, 'ETP_BRIDGE_STAGE_INVALID');
  assert.equal(bundle.state.reauthCalls, 0, 'the Owner is not asked for a PIN');
  for (const language of ['mr', 'hi']) {
    const second = mountScreen({ gateway: realFacade(), language });
    await second.started;
    pickFile(second, new PackFile(monthDraft.bytes)); submit(second); await settle(second);
    click(second, 'etpBridgeCompareBtn'); await settle(second);
    assert.ok(second.$('etpBridgeResultBody').textContent.includes(STR[language].outMatch), language);
    assert.ok(second.$('etpBridgeFacts').textContent.includes(keyPair.anchor.keyId));
  }
});

test('integration: a different XLSX side gives Differences found, listed by day and measure, and nothing is applied', async () => {
  const rows = clone(monthRows);
  rows.R022[0].net_value = String(Number(rows.R022[0].net_value) + 1);
  rows.R022[0].invoice_quantity = rows.R022[0].invoice_quantity;
  const mounted = mountScreen({ gateway: realFacade({ rows }) });
  await mounted.started;
  pickFile(mounted, new PackFile(monthDraft.bytes)); submit(mounted); await settle(mounted);
  click(mounted, 'etpBridgeCompareBtn'); await settle(mounted);
  const body = mounted.$('etpBridgeResultBody').textContent;
  assert.ok(body.includes('Differences found'), body.slice(0, 400));
  assert.match(body, /\d of 4 reports differ\./);
  assert.match(body, /\d{4}-\d{2}-\d{2} - Net value - engine pack [-\d,.]+ - XLSX import [-\d,.]+/);
  assert.ok(body.includes('Differences are information only. Nothing is published and no Control Centre figure has changed.'));
  assert.equal(mounted.$('etpBridgeNotice').getAttribute('role'), 'status');
});

test('integration: no XLSX import for the period is information, not an error, and the pack stays checked', async () => {
  const mounted = mountScreen({ gateway: realFacade({ rows: null }) });
  await mounted.started;
  pickFile(mounted, new PackFile(monthDraft.bytes)); submit(mounted); await settle(mounted);
  click(mounted, 'etpBridgeCompareBtn'); await settle(mounted);
  const body = mounted.$('etpBridgeResultBody').textContent;
  assert.ok(body.includes(`${STR.en.m_nobase} (ETP_BRIDGE_COMPARE_NO_TABLET_GENERATION)`), body.slice(0, 300));
  assert.ok(body.includes('Cannot compare'));
  assert.equal(mounted.$('etpBridgeStaged').hidden, false);
});

test('integration: roles. Store Manager is asked for the Owner PIN once; a refused PIN and a role without access get their plain reason', async () => {
  const approved = makeRoot({ owner: false });
  const manager = mountScreen({ gateway: realFacade({ bundle: approved }) });
  await manager.started;
  assert.equal(noticeText(manager), `${STR.en.nIdle} ${STR.en.nReauth}`);
  pickFile(manager, new PackFile(monthDraft.bytes)); submit(manager); await settle(manager);
  assert.equal(approved.state.reauthCalls, 1);
  assert.equal(manager.screen.snapshot().phase, 'staged');
  const refused = makeRoot({ owner: false, reauth: async () => false });
  const declined = mountScreen({ gateway: realFacade({ bundle: refused }) });
  await declined.started;
  const file = new PackFile(monthDraft.bytes);
  pickFile(declined, file); submit(declined); await settle(declined);
  assert.equal(declined.text('etpBridgeNotice'), `${STR.en.m_reauth} (ETP_BRIDGE_REAUTH_DENIED)`);
  assert.equal(file.reads, 0, 'no PIN, no read');
  for (const [role, canOpen] of [['Sales', true], ['Store Manager', false], ['Cashier', false]]) {
    const denied = mountScreen({ gateway: realFacade({ bundle: makeRoot({ owner: false, role, canOpen }) }) });
    await denied.started;
    assert.equal(denied.text('etpBridgeGateTitle'), STR.en.deniedTitle, role);
    assert.equal(denied.$('etpBridgeFile').disabled, true);
  }
});

test('integration: every synthetic pack of the case set gets its plain reason from the real verifier code, in English, Marathi and Hindi', async () => {
  const set = await buildCaseSet({});
  const verifier = verifierApi.create({ trustedKeys: [set.anchor], crypto: webcrypto });
  const cases = set.cases.filter((entry) => !entry.id.startsWith('large') && entry.bytes.length > 0);
  assert.ok(cases.length > 100);
  const refusals = new Set();
  let accepted = 0;
  for (const entry of cases) {
    const language = LANGS[cases.indexOf(entry) % 3];
    const now = () => Date.parse(`${entry.verifyOptions.today}T06:30:00Z`);
    const mounted = mountScreen({ gateway: realFacade({ verifier, now }), language });
    await mounted.started;
    const file = new PackFile(entry.bytes);
    pickFile(mounted, file); submit(mounted); await settle(mounted);
    if (entry.expect.withTestKey === 'ACCEPTED') {
      assert.equal(mounted.screen.snapshot().phase, 'staged', entry.id);
      accepted += 1;
      continue;
    }
    const code = entry.expect.withTestKey;
    refusals.add(code);
    assert.ok(Object.prototype.hasOwnProperty.call(CODE_MSG, code), `${entry.id}: no wording for ${code}`);
    assert.equal(mounted.text('etpBridgeNotice').startsWith(`${STR[language][CODE_MSG[code]]} (${code})`), true, `${entry.id}: ${mounted.text('etpBridgeNotice')}`);
    assert.notEqual(CODE_MSG[code], 'm_internal', `${entry.id}: ${code} must not fall back to the generic sentence`);
  }
  assert.ok(accepted >= 10);
  assert.ok(refusals.size >= 20, `${refusals.size} different verifier refusal codes were drawn`);
});

test('integration: the service store AW330 and HEMW packs are refused with their own reasons (store rules live in the facade; the screen only words them)', async () => {
  const real = await trusted.verify(monthDraft.bytes, DEFAULT_VERIFY_OPTIONS);
  assert.equal(real.ok, true);
  for (const [store, code] of [['HEMW', 'ETP_BRIDGE_STORE_HEMW_BLOCKED'], ['AW330', 'ETP_BRIDGE_STORE_REFUSED']]) {
    const verifier = { gate: trusted.gate, verify: async () => ({ ...real, scope: { ...real.scope, storeCode: store, scopeKey: `${store}|2026-27|2026-08-01..2026-08-31` } }) };
    const mounted = mountScreen({ gateway: realFacade({ verifier }) });
    await mounted.started;
    pickFile(mounted, new PackFile(monthDraft.bytes)); submit(mounted); await settle(mounted);
    assert.equal(mounted.text('etpBridgeNotice'), `${STR.en[CODE_MSG[code]]} (${code})`, store);
    assert.equal(mounted.$('etpBridgeStaged').hidden, true);
  }
});
