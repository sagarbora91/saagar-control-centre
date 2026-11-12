// U05-F-03: a count box may not exceed 999,999.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCtx, dayRecord } from './lib/fix-S06-stock-vm.mjs';

const today = () => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
const KEY = () => 'saagar_stock_titanworld_' + today();
const BID = 'b_' + [...'CLASSIC'].map(ch => ch.codePointAt(0).toString(16)).join('_');

test('F-03 stockOversize table', () => {
  const { api } = makeCtx();
  assert.equal(api.stockOversize('99999999999'), true);
  assert.equal(api.stockOversize('999999'), false);
  assert.equal(api.stockOversize('1000000'), true);
  assert.equal(api.stockOversize(1e21), true);
  assert.equal(api.stockOversize(''), false);
});

function seeded() {
  const c = makeCtx({ storage: { [KEY()]: JSON.stringify(dayRecord()) } });
  c.api.st.mode = 'sm';
  return c;
}

test('F-03 updOpen / updMov / updClose refuse an oversize value and keep the old one', () => {
  const c = seeded();
  const before = c.mem.get(KEY());
  const i1 = { value: '99999999999', style: {} };
  c.api.updOpen(BID, 'display', '99999999999', i1);
  assert.equal(c.mem.get(KEY()), before);
  assert.equal(i1.value, 3);
  assert.ok(c.toastText().some(t => t.includes('Quantity too large')));
  const i2 = { value: '99999999999', style: {} };
  c.api.updMov(BID, 'inward', '99999999999', i2);
  assert.equal(c.mem.get(KEY()), before);
  const i3 = { value: '99999999999', style: {} };
  c.api.updClose(BID, 'display', '99999999999', i3);
  assert.equal(c.mem.get(KEY()), before);
  assert.equal(c.lastToast().cls.includes('err'), true);
});

test('F-03 normal value still saves', () => {
  const c = seeded();
  c.api.updOpen(BID, 'display', '7', { value: '7', style: {} });
  assert.equal(JSON.parse(c.mem.get(KEY())).opening.CLASSIC.display, 7);
});

test('F-03 import with an oversize value is rejected and nothing stored', async () => {
  const c = makeCtx(); c.api.st.mode = 'sm';
  const r = dayRecord(); r.opening.CLASSIC.display = '99999999999';
  await c.pickFile(JSON.stringify({ store: 'titanworld', date: today(), data: r }));
  assert.equal(c.mem.has(KEY()), false);
  assert.ok(c.toastText().some(t => t.startsWith('Import rejected') && t.includes('too large')));
});
