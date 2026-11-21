// Service wave 2, governance T13: the ten new report types. Static guards only (the builders have their own tests in svc2-reports-*):
// the names, the module of each in both copies of REPORT_MODULE, no new public name on SaagarReport, no new global, no new storage or message call.
// The reference copy of the report file is the workspace snapshot g0\pre-wave-service2 (skips with a message when it is absent).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..');
const WORKSPACE = process.env.SVC_W2_WORKSPACE || 'E:\\Projects\\Saagar Control Centre Workspace';
const G0_ROOT = path.join(WORKSPACE, 'service-wave-2', 'g0', 'pre-wave-service2');
const HAVE_G0 = fs.existsSync(path.join(G0_ROOT, 'www', 'saagar-report.js'));
const SKIP = HAVE_G0 ? false : 'the G0 snapshot of the report file is not on this machine';

const TYPES = ['serviceAdvancesHeld', 'serviceBillSummary', 'serviceCreditNote', 'serviceDaySummary', 'serviceReceipt', 'serviceRefundVoucher', 'serviceRevenue',
  'serviceTaxInvoiceV2', 'serviceUnbilledIssues', 'serviceWarrantySheet'];
const reg = JSON.parse(fs.readFileSync(path.join(REPO, 'tests', 'fixtures', 'service-wave-2', 'capability-register.json'), 'utf8'));
const report = fs.readFileSync(path.join(REPO, 'www', 'saagar-report.js'), 'utf8');
const search = fs.readFileSync(path.join(REPO, 'www', 'shared', 'shell-search.js'), 'utf8');
const g0Report = HAVE_G0 ? fs.readFileSync(path.join(G0_ROOT, 'www', 'saagar-report.js'), 'utf8') : '';

async function loadAt(root) {
  const prev = process.env.S02_REPO_ROOT;
  process.env.S02_REPO_ROOT = root;
  try {
    const m = await import('./lib/fix-s02-load.mjs?root=' + encodeURIComponent(root));
    return m.loadReport().R;
  } finally {
    if (prev === undefined) delete process.env.S02_REPO_ROOT; else process.env.S02_REPO_ROOT = prev;
  }
}

test('T13.1 the ten type names are the register ones; none looks like the Phase 1 svcXxx family (those are pinned at six)', () => {
  assert.deepEqual(reg.reports.map((r) => r.type).sort(), TYPES);
  for (const t of TYPES) assert.equal(/^svc[A-Z]/.test(t), false, t);
  assert.equal(Object.keys(JSON.parse(JSON.stringify(reg.reports))).length, 10);
});

test('T13.2 each type is in META and in REPORT_MODULE of the report file and of shell-search, with the same module', () => {
  const block = (text) => { const i = text.indexOf('var REPORT_MODULE = {'); assert.ok(i >= 0); return text.slice(i, text.indexOf('};', i)); };
  const mod = (text, t) => { const m = new RegExp(t + "\\s*:\\s*'([^']*)'").exec(block(text)); return m ? m[1] : null; };
  const metaAt = report.indexOf('var META = {');
  assert.ok(metaAt >= 0);
  const meta = report.slice(metaAt);
  for (const t of TYPES) {
    assert.ok(new RegExp('\\b' + t + '\\s*:').test(meta), t + ' in META');
    const a = mod(report, t);
    const b = mod(search, t);
    assert.notEqual(a, null, t + ' in REPORT_MODULE of the report file');
    // the report file says '*' for an owner-level type, shell-search says '' (same meaning, written differently on purpose)
    assert.equal(b, a === '*' ? '' : a, t + ' same module in shell-search');
    assert.equal(a, reg.reports.find((r) => r.type === t).module, t + ' module equals the register');
  }
});

test('T13.3 no new public name on SaagarReport and REPORT_MODULE grows by exactly the ten types (the hub and Phase 1 rows are unchanged)', { skip: SKIP }, async () => {
  const now = await loadAt(REPO);
  const old = await loadAt(G0_ROOT);
  assert.deepEqual(Object.keys(now).sort(), Object.keys(old).sort(), 'the public surface of SaagarReport');
  const mapOf = (text) => {
    const i = text.indexOf('var REPORT_MODULE = {');
    const out = {};
    for (const m of text.slice(i, text.indexOf('};', i)).matchAll(/([A-Za-z0-9_]+)\s*:\s*'([^']*)'/g)) out[m[1]] = m[2];
    return out;
  };
  const mNow = mapOf(report);
  const mOld = mapOf(g0Report);
  assert.ok(Object.keys(mOld).length > 10);
  assert.deepEqual(Object.keys(mNow).filter((k) => !(k in mOld)).sort(), TYPES);
  for (const k of Object.keys(mOld)) assert.equal(mNow[k], mOld[k], 'Phase 1 row changed: ' + k);
});

test('T13.4 no new global, no new storage call and no message call in the report file (counts equal G0)', { skip: SKIP }, () => {
  const n = (t, re) => (t.match(re) || []).length;
  for (const re of [/postMessage/g, /localStorage/g, /sessionStorage/g, /getItem\(/g, /setItem\(/g, /document\.write/g, /\beval\(/g, /\bfetch\(/g, /XMLHttpRequest/g, /window\.[A-Za-z_]+\s*=/g, /indexedDB/g]) {
    assert.equal(n(report, re), n(g0Report, re), String(re));
  }
});

test('T13.5 the new builders read only what the caller hands over: no job, bill or money store is read inside the ten builders', () => {
  const at = report.indexOf('function svc2Check');
  assert.ok(at > 0, 'the new block starts with svc2Check');
  const end = report.indexOf('var META = {', at);
  const block = report.slice(at, end);
  for (const w of ['localStorage', 'SaagarServiceBilling', 'SaagarServiceStores', 'saagar_svcs_', 'st_v2_', 'getItem', 'JSON.parse(']) assert.equal(block.includes(w), false, w);
});
