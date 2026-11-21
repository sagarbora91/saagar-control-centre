// U05-F-04: import must not create a negative closing balance; part B guards updOpen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCtx, dayRecord } from './lib/fix-S06-stock-vm.mjs';

const today = () => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
const KEY = () => 'saagar_stock_titanworld_' + today();
const BID = 'b_' + [...'CLASSIC'].map(ch => ch.codePointAt(0).toString(16)).join('_');
const over = () => { const r = dayRecord(); r.opening.CLASSIC.systemStock = 10; r.movements.CLASSIC.sales = 500; return r; };

test('F-04 overdrawn single-day import is rejected and nothing stored', async () => {
  const c = makeCtx(); c.api.st.mode = 'sm';
  await c.pickFile(JSON.stringify({ store: 'titanworld', date: today(), data: over() }));
  assert.equal(c.mem.has(KEY()), false);
  assert.ok(c.toastText().some(t => t.startsWith('Import rejected') && t.includes('negative')));
});

test('F-04 balanced import is stored', async () => {
  const c = makeCtx(); c.api.st.mode = 'sm';
  await c.pickFile(JSON.stringify({ store: 'titanworld', date: today(), data: dayRecord() }));
  assert.equal(c.mem.has(KEY()), true);
});

test('F-04 full backup keeps an overdrawn day but warns', async () => {
  const c = makeCtx(); c.api.st.mode = 'sm';
  const k = 'saagar_stock_titanworld_2026-02-02';
  await c.pickFile(JSON.stringify({ [k]: over() }));
  assert.equal(c.mem.has(k), true);
  const t = c.toastText().find(x => x.startsWith('Full backup imported'));
  assert.ok(t && /negative/.test(t), String(t));
});

test('F-04 part B: lowering opening system below recorded outflow is refused', () => {
  const rec = dayRecord(); rec.movements.CLASSIC.sales = 8; rec.opening.CLASSIC.systemStock = 10;
  const c = makeCtx({ storage: { [KEY()]: JSON.stringify(rec) } });
  c.api.st.mode = 'sm';
  const input = { value: '5', style: {} };
  c.api.updOpen(BID, 'systemStock', '5', input);
  assert.equal(JSON.parse(c.mem.get(KEY())).opening.CLASSIC.systemStock, 10);
  assert.equal(input.value, 10);
  assert.ok(c.lastToast().cls.includes('err'));
});
