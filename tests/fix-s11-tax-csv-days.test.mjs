// S11 U11-F03 (G7): negative Days Left is a plain number in the CSV; text cells stay guarded.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, run, MONTHS } from './lib/fix-s11-extract.mjs';

test('F03: negative Days Left has no apostrophe; positive unchanged; text cells still guarded', () => {
  const mk = (id, name) => ({ id, due: '1 Apr', name, form: '', cat: 'it', freq: 'M' });
  const items = [mk('late', 'Late'), mk('soon', 'Soon'), mk('x1', '=HYPERLINK("x")'), mk('x2', '-1+2')];
  const days = { 'late': -196, 'soon': 5, 'x1': 3, 'x2': 3 };
  // getDaysLeft receives (it.due, m); route by item through a lookup on the call order instead
  const order = items.map(i => days[i.id]);
  let n = 0;
  const posts = [];
  const ctx = buildContext(['exportComplianceCSV'], {
    MONTHS, String, Math, Blob,
    alert: () => {},
    window: { parent: { postMessage: m => posts.push(m) } },
    SaagarModuleRuntime: { targetOrigin: '*' },
    getActiveFirm: () => ({ id: 'f1', name: 'Firm' }),
    getFinancialYearLabel: () => 'FY 2026-27',
    getVisibleItems: x => x,
    getMonthItems: m => (m === 'April' ? items : []),
    isItemNA: () => false, isItemDone: () => false, getItemRecord: () => null,
    getControlProfile: () => ({ responsible: 'R', risk: 'Low' }),
    getDaysLeft: () => order[n++],
    stripHtml: s => String(s), renderFYText: s => String(s), catLabel: c => c
  });
  run(ctx, 'exportComplianceCSV()');
  const lines = posts[0].text.replace(/^﻿/, '').split('\r\n');
  const last = l => l.split(',').pop();
  assert.equal(last(lines[1]), '-196');
  assert.equal(last(lines[2]), '5');
  assert.ok(lines[3].includes("\"'=HYPERLINK(\"\"x\"\")\""), lines[3]);
  assert.ok(lines[4].includes("'-1+2"), lines[4]);
  assert.ok(!lines.slice(1).some(l => /,'-\d+$/.test(l)), 'no apostrophe before a plain number');
});

test('F03 (G7, audit): text cells are always quoted and guarded; only Days Left is a plain number', () => {
  const items = [{ id: 'a', due: '1 Apr', name: '-5', form: 'GSTR-1', cat: 'gst', freq: 'M' }];
  const posts = [];
  const ctx = buildContext(['exportComplianceCSV'], {
    MONTHS, String, Math, Blob,
    alert: () => {},
    window: { parent: { postMessage: m => posts.push(m) } },
    SaagarModuleRuntime: { targetOrigin: '*' },
    getActiveFirm: () => ({ id: 'f1', name: 'Firm' }),
    getFinancialYearLabel: () => 'FY 2026-27',
    getVisibleItems: x => x,
    getMonthItems: m => (m === 'April' ? items : []),
    isItemNA: () => false, isItemDone: () => false, getItemRecord: () => null,
    getControlProfile: () => ({ responsible: 'R', risk: 'Low' }),
    getDaysLeft: () => -7,
    stripHtml: s => String(s), renderFYText: s => String(s), catLabel: c => c
  });
  run(ctx, 'exportComplianceCSV()');
  const lines = posts[0].text.replace(/^﻿/, '').split('\r\n');
  assert.ok(lines[0].startsWith('"Firm","FY","Month"') && lines[0].endsWith('"Days Left"'), lines[0]);
  assert.equal(lines[1], '"Firm","FY 2026-27","April","1 Apr","\'-5","GSTR-1","gst","M","R","Low","Pending","",-7');
});
