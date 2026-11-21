/* Fix wave S05 (DSR): audit sign-off. U04-F3, F5, CR-F3, F10. */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(repoDir, 'www', 'modules', 'dsr', 'index.html'), 'utf8');

function slice(marker) {
  const i = SRC.indexOf(marker);
  assert.notEqual(i, -1, marker + ' must exist in the DSR module');
  const re = /\n(?:function |async function |let |const |\/\*)/g;
  re.lastIndex = i + marker.length;
  const m = re.exec(SRC);
  return SRC.slice(i, m ? m.index : SRC.length);
}
function load(markers, fakes) {
  const ctx = vm.createContext(Object.assign({}, fakes));
  vm.runInContext(markers.map(slice).join('\n'), ctx);
  return ctx;
}
function fakeStorage(init, opts) {
  const m = new Map(Object.entries(init || {}));
  return {
    m,
    get length() { return m.size; },
    key: (i) => Array.from(m.keys())[i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (opts && opts.failSet) throw new Error('quota'); m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}
const KEY = 'saagar_dsr_2026-11-11_Asha';
function stored(over) {
  return Object.assign({ date: '2026-11-11', staffName: 'Asha', submitted: true, audit: null, sales: [{ billNo: '1', amount: 5 }], opening: { a: '1' }, closing: { a: '2' } }, over || {});
}
function auditEnv(rec, opts) {
  const ls = fakeStorage({ [KEY]: JSON.stringify(rec) }, opts);
  const toasts = [];
  let reauthCalls = 0;
  const st = { auditRec: JSON.parse(ls.getItem(KEY)), auditKey: KEY };
  const fakes = {
    localStorage: ls, toasts, st, SK_DSR: 'saagar_dsr_', _recCache: { key: null, rec: null },
    SCORE_MAX: { opening: 10, sales: 20 },
    el: (id) => (id === 'sc-opening' ? { value: '10' } : id === 'sc-sales' ? { value: '8' } : id === 'audit-remarks' ? { value: 'ok' } : null),
    toast: (m, t) => toasts.push({ m, t }),
    stReauth: async () => { reauthCalls++; return true; },
    nowTime: () => '10:00', renderSMAudit() {}, renderSMSubmissions() {},
  };
  const c = load(['function recKey(', 'function writeAuditOnly(', 'async function submitAudit('], fakes);
  return { c, ls, toasts, st, reauth: () => reauthCalls };
}

test('approving a past-day submitted report stores the audit', async () => {
  const before = stored();
  const e = auditEnv(before);
  await e.c.submitAudit(true);
  const after = JSON.parse(e.ls.getItem(KEY));
  assert.equal(after.audit.approved, true);
  assert.equal(after.audit.total, 18);
  assert.equal(e.st.auditRec.audit.approved, true);
  const rest = Object.assign({}, after); delete rest.audit;
  const was = Object.assign({}, before); delete was.audit;
  assert.deepEqual(rest, was, 'nothing but the audit block may change');
  assert.equal(e.toasts.at(-1).m, 'Report approved');
});

test('a failed write is reported and never shown as success', async () => {
  const e = auditEnv(stored(), { failSet: true });
  await e.c.submitAudit(true);
  assert.equal(e.toasts.at(-1).t, 'err');
  assert.equal(e.st.auditRec.audit, null);
  assert.equal(JSON.parse(e.ls.getItem(KEY)).audit, null);
});

test('unsubmitted report cannot be approved or rejected', async () => {
  const e = auditEnv(stored({ submitted: false }));
  await e.c.submitAudit(true);
  await e.c.submitAudit(false);
  assert.equal(e.reauth(), 0);
  assert.equal(e.toasts.length, 2);
  assert.ok(e.toasts.every((t) => t.t === 'err'));
  assert.equal(JSON.parse(e.ls.getItem(KEY)).audit, null);
  /* second guard: the stored copy was unlocked while the screen was open */
  const e2 = auditEnv(stored());
  const raw = JSON.parse(e2.ls.getItem(KEY)); raw.submitted = false; e2.ls.setItem(KEY, JSON.stringify(raw));
  await e2.c.submitAudit(true);
  assert.equal(JSON.parse(e2.ls.getItem(KEY)).audit, null);
  assert.equal(e2.toasts.at(-1).t, 'err');
  const view = slice('function renderSMAudit(');
  const a = view.indexOf('r.submitted ?');
  const b = view.indexOf('data-action="submit-audit-approve"');
  assert.ok(a > 0 && b > a, 'approve button must sit inside a r.submitted conditional');
  assert.ok(view.indexOf('data-action="submit-audit-reject"') > a);
});

test('empty counts score zero for opening and closing', () => {
  const c = load(['function stockEntered(', 'function calcAutoScores('], {
    activeStockCats: () => [{ id: 'a' }, { id: 'b' }],
    MKT_ITEMS: [], TASK_LIST: [{ id: 't' }], taskNumber: (x) => Number(x) || 0,
  });
  const base = () => ({ staffName: 'x', opening: {}, closing: {}, sales: [], marketing: {}, tasks: {}, cleaning: { cp1: {}, cp2: {} } });
  const s = c.calcAutoScores(base());
  assert.equal(s.opening, 0);
  assert.equal(s.closing, 0);
  const r = base(); r.opening = { a: '0', b: '0' }; r.closing = { a: '0', b: '3' };
  const s2 = c.calcAutoScores(r);
  assert.equal(s2.opening, 10);
  assert.equal(s2.closing, 20);
  const r3 = base(); r3.opening = { a: '1', b: null }; r3.closing = { a: '', b: '1' };
  const s3 = c.calcAutoScores(r3);
  assert.equal(s3.opening, 0);
  assert.equal(s3.closing, 0);
});

test('submitted day reads complete in the progress meter', () => {
  const policy = require('../www/dsr-completion-policy.js');
  const c = load(['function dsrD4SealSummary('], {});
  const ctx = { stockCategories: [{ id: 'a' }], taskList: [{ id: 't' }] };
  const rec = { submitted: true, sales: [], opening: {}, closing: {}, tasks: {}, cleaning: {} };
  const sum = policy.completionSummary(rec, ctx);
  const sealed = c.dsrD4SealSummary(rec, sum);
  assert.equal(sealed.done, sealed.total);
  assert.equal(sealed.percent, 100);
  const open = Object.assign({}, rec, { submitted: false });
  const sum2 = policy.completionSummary(open, ctx);
  assert.equal(c.dsrD4SealSummary(open, sum2), sum2);
  assert.ok(slice('function updateProgress(').includes('dsrD4SealSummary(rec, dsrD4Summary(rec))'));
});
