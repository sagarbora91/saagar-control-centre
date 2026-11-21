// S02 U02-F02 (owner brief label and note) and X2-F07 (kv value may not run over its label)
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadReport, fakeJsPdf } from './lib/fix-s02-load.mjs';

function brief(dsr, extra = {}) {
  const globals = Object.assign({
    buildTodayBrief: () => ({ qmsSales: 210000, qmsPurchases: 16, qmsWalkins: 20, qmsConversion: 80, taxOverdue: 67 }),
    computeQmsDay: () => ({ byCro: [] }),
    computeDsrDay: () => dsr,
    computeServiceAging: () => ({}),
    computeTaxStatus: () => ({ upcoming: [{ status: 'Overdue', item: 'GSTR-1 – March Outward Supplies (Monthly Filers)' }] }),
    computeLeaveDay: () => ({ items: [] })
  }, extra);
  const { R } = loadReport({ globals });
  return R._buildModel('ownerBrief', { date: '2026-11-11' });
}
const notes = (m) => m.blocks.filter((b) => b.t === 'note').map((b) => b.text);

test('first KPI is the Queue figure, honestly labelled, and no DSR bill count sits under it', () => {
  const m = brief({ salesAmt: 238500, salesCnt: 20, present: 5, staff: [], submitted: 0 });
  const k = m.blocks.find((b) => b.t === 'kpi').items[0];
  assert.equal(k.label, 'Sales (Queue)');
  assert.equal(k.value, '₹2,10,000');
  assert.equal(k.sub, '16 purchases');
  assert.ok(!JSON.stringify(m).includes('bills (DSR)'));
  const n = notes(m).filter((x) => /Daily Sales Register/.test(x));
  assert.equal(n.length, 1);
  assert.ok(n[0].includes('₹2,38,500') && n[0].includes('20 bills') && n[0].includes('₹2,10,000'));
});

test('no note when the DSR agrees or has no rows', () => {
  assert.equal(notes(brief({ salesAmt: 210000, salesCnt: 16, present: 5 })).filter((x) => /Daily Sales Register/.test(x)).length, 0);
  assert.equal(notes(brief({ present: 5 })).filter((x) => /Daily Sales Register/.test(x)).length, 0);
});

test('X2-F07 the tax pair is split so the long item name is its own short pair', () => {
  const m = brief({ present: 1 });
  const kv = m.blocks.filter((b) => b.t === 'kv').pop();
  const pairs = kv.pairs;
  assert.deepEqual([...pairs[0]], ['Tax overdue', '67']);
  assert.equal(pairs[1][0], 'Next overdue');
  assert.ok(pairs[1][1].length <= 35 && pairs[1][1].startsWith('GSTR-1'));
  assert.equal(pairs.length, 6);
});

test('X2-F07 a long kv value never overlaps its own label', () => {
  const log = [];
  const { R } = loadReport({ globals: { jspdf: { jsPDF: fakeJsPdf(log) } } });
  R._renderBlocks([{ t: 'kv', cols: 2, pairs: [['Tax overdue', '67 · GSTR-1 – March Outward Supplies (Monthly Filers)']] }], 'portrait');
  const key = log.find((x) => x.s === 'Tax overdue');
  const val = log.find((x) => x.o && x.o.align === 'right' && /67/.test(x.s));
  assert.ok(key && val, JSON.stringify(log));
  const keyRight = key.x + key.s.length * 5;
  const valLeft = val.x - val.s.length * 5;
  assert.ok(valLeft > keyRight, 'value left ' + valLeft + ' must be right of key right ' + keyRight);
});
