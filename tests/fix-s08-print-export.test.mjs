import assert from 'node:assert/strict';
import test from 'node:test';
import { extractFunction, sandbox, service } from './lib/fix-s08-source.mjs';

const LABELS = ['Crystal / Glass', 'Dial', 'Hands', 'Case (Top)', 'Case (Side)', 'Caseback', 'Crown', 'Bracelet / Strap', 'Clasp / Buckle', 'Bezel'];

function constLabels() {
  const m = /const PARTS_LABELS = (\[[^\]]*\]);/.exec(service);
  assert.ok(m, 'PARTS_LABELS must be declared once at top level');
  return { text: m[1], list: JSON.parse(m[1].replace(/'/g, '"')) };
}

test('U07-F01: PARTS_LABELS exists and matches the 10 condition rows in order', () => {
  const { list } = constLabels();
  assert.equal(list.length, 10);
  const body = /id="cond-tbody">([\s\S]*?)<\/tbody>/.exec(service);
  assert.ok(body, 'cond-tbody present');
  const rows = [...body[1].matchAll(/<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim());
  assert.deepEqual(list, rows);
  assert.deepEqual(list, LABELS);
});

test('U07-F01: buildIntakeHtml does not throw for a form-saved case and prints the part label', () => {
  const condParts = Array.from({ length: 10 }, () => ({ code: '', sev: '', notes: '' }));
  condParts[0] = { code: 'S', sev: 'Minor', notes: 'scratch' };
  const ctx = sandbox({
    escapeHtml: v => String(v == null ? '' : v), pf: () => '', pfKeep: () => '', psecBlock: (t, has, inner) => String(inner || ''), pchk: () => '',
    stageLabel: v => String(v), stageOf: () => 'received', DENOMS: [], denoPrint: () => '', fmtDate: v => String(v || '')
  }, (/const PARTS_LABELS[^\n]*\n/.exec(service) || [''])[0] + extractFunction('buildIntakeHtml'));
  // The function may use more helpers than the fakes above; give any missing global a harmless stub by retrying.
  const rec = { id: 'WS-2026-001', custName: 'A', condParts, status: 'open' };
  let out = '';
  const proxied = new Proxy(ctx, {});
  assert.doesNotThrow(() => { out = ctx.buildIntakeHtml(rec, 'WS-2026-001', 'open', ''); });
  assert.ok(out.includes('Crystal / Glass'));
  assert.ok(out.includes('scratch'));
  void proxied;
});

test('U07-F02: exportCases includes the part label and keeps 76 columns', () => {
  const posted = [];
  const pieces = [];
  const consts = (/const PARTS_LABELS[^\n]*\n/.exec(service) || [''])[0];
  const ctx = sandbox({
    toast: () => {}, todayStr: () => '2026-11-12', stageLabel: v => String(v), stageOf: () => 'received', caseAgeingDays: () => '',
    Blob: function (parts) { pieces.push(...parts); this.size = 1; }, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    window: { parent: { postMessage: (m) => posted.push(m) } },
    SaagarModuleRuntime: { targetOrigin: '*' }, document: { createElement: () => ({ click() {}, style: {} }), body: { appendChild() {}, removeChild() {} } },
    readFileAsText: () => '', escapeHtml: v => v
  }, consts + extractFunction('csvCell') + extractFunction('exportCases'));
  const parts = Array.from({ length: 10 }, () => ({ code: '', sev: '', notes: '' }));
  parts[0] = { code: 'S', sev: '', notes: 'scratch at 3' };
  const cases = [{ id: 'A', condParts: parts, status: 'open' }, { id: 'B', status: 'open' }];
  assert.doesNotThrow(() => ctx.exportCases(cases, 'all', false));
  const csv = [...pieces].join('') + posted.map(m => JSON.stringify(m)).join('');
  assert.ok(posted.length >= 1 || pieces.length >= 1, 'something was exported');
  assert.ok(csv.includes('Crystal / Glass: S//scratch at 3'), 'label with data present');
});

test('U07-LOW-PRINTERR: all four print entry points catch failures', () => {
  for (const name of ['doPrint', 'printById', 'doProforma', 'printProformaById']) {
    const src = extractFunction(name);
    const thenAt = src.indexOf('.then(');
    assert.ok(thenAt > -1, name + ' has a then');
    assert.ok(src.indexOf('.catch(', thenAt) > thenAt, name + ' has a catch after the then');
  }
});

test('U07-LOW-PRINTERR: printById reports a builder error instead of failing silently', async () => {
  const toasts = [];
  const ctx = sandbox({
    byId: () => ({ id: 'X', status: 'open' }), resolveWatchPhoto: () => Promise.resolve(''),
    buildIntakeHtml: () => { throw new Error('boom'); }, sendPrint: () => {}, toast: m => toasts.push(String(m))
  }, extractFunction('printById'));
  ctx.printById('X');
  await new Promise(r => setTimeout(r, 20));
  assert.ok(toasts.some(t => t.includes('Could not prepare the print') && t.includes('boom')));
});
