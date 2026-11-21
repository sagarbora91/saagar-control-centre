// S04 U03-F04 (+ G7 CSV rule): formula-safe CSV, last 31 days only, honest names.
import assert from 'node:assert/strict';
import test from 'node:test';
import { fn, constLine, qmsSource, run } from './lib/fix-s04-qms.mjs';

const CODE = [constLine('todayISO'), constLine('fmtDT'), 'const kk=n=>String(n??"").trim().toLowerCase();',
  ...['qmsCsvCell', 'qmsCustomersInLastDays', 'exportCSV', 'customerBusinessDate', 'indiaBusinessDateFromIso', 'croName'].map(fn)].join('\n')
  + '\nthis.exportCSV=exportCSV;';

function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(11, 0, 0, 0); return d.toISOString(); }
function make(customers) {
  const posted = [], toasts = [];
  class FakeBlob { constructor(parts) { this.text = parts.join(''); } }
  const parent = { postMessage: (m) => posted.push(m) };
  const win = { parent };
  const ctx = {
    state: { customers, cros: [{ id: 'c1', name: 'Asha' }] }, Blob: FakeBlob, window: win, posted, toasts,
    SaagarModuleRuntime: { targetOrigin: '*' }, toast: (m, t) => toasts.push({ m, t }),
  };
  run(ctx, CODE);
  return ctx;
}
const cust = (name, ago, extra = {}) => ({ id: name + ago, name, mobile: '9876543210', queueNo: 'Q-001', visitType: 'New', entryTime: daysAgo(ago), assignedCroId: 'c1', status: 'Closed', ...extra });

test('S04-F04 formula cells are prefixed, numbers are not, 60-day-old rows are absent', () => {
  const list = [
    cust('=HYPERLINK("http://example.invalid","click")', 2), cust('+1', 2), cust('@x', 2), cust('-2', 2), cust('\t=cmd', 2),
    cust('Plain', 2, { purchaseAmount: 1500 }), cust('NegAmt', 3, { purchaseAmount: -5 }), cust('OldRow', 60),
  ];
  const c = make(list);
  c.exportCSV();
  assert.equal(c.posted.length, 1);
  const m = c.posted[0];
  const text = m.file.text;
  assert.ok(text.includes('"\'=HYPERLINK(""http://example.invalid"",""click"")"'));
  for (const v of ['\'+1', '\'@x', '\'-2', '\'\t=cmd']) assert.ok(text.includes('"' + v + '"'), v);
  assert.ok(text.includes('"Plain"') && !text.includes('"\'Plain"'));
  assert.ok(text.includes('"-5"') && !text.includes('"\'-5"'), 'numeric amount stays a plain number');
  assert.ok(text.includes('"1500"'));
  assert.ok(!text.includes('OldRow'));
  assert.match(m.fileName, /^qms-customers-last-31-days-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.match(m.scopeLabel, /31 days/);
  assert.equal(m.exportId, 'qms-customers-csv');
  assert.equal(m.scopeId, 'qms-customers-31d');
  assert.equal(m.purposeId, 'register-reporting');
  assert.equal(m.rowCount, 7);
  assert.equal(text.split('\n').length, 1 + 7);
});
test('S04-F04 an empty window posts nothing and toasts', () => {
  const c = make([cust('OldRow', 60)]);
  c.exportCSV();
  assert.equal(c.posted.length, 0);
  assert.equal(c.toasts.length, 1);
  assert.match(c.toasts[0].m, /No customers in the last 31 days/);
});
test('S04-F04 source: no all-register export left, rangeStats shares the window', () => {
  assert.doesNotMatch(qmsSource, /qms-active-customers|qms-active-csv/);
  assert.match(fn('rangeStats'), /qmsCustomersInLastDays\(days\)/);
  assert.match(fn('exportCSV'), /r\.map\(qmsCsvCell\)/);
});
