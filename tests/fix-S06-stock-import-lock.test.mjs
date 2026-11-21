// U05-F-01: import must not replace a locked, signed-off day without the Owner PIN.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCtx, dayRecord } from './lib/fix-S06-stock-vm.mjs';

const today = () => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
const KEY = () => 'saagar_stock_titanworld_' + today();
const lockedDay = () => dayRecord({ openingLocked: true, movementsSubmitted: true, closingLocked: true });
const fileFor = rec => JSON.stringify({ store: 'titanworld', date: today(), data: rec });
function setup(reauth, stored) {
  const c = makeCtx({ reauth, storage: stored ? { [KEY()]: JSON.stringify(stored) } : {} });
  c.api.st.mode = 'sm';
  return c;
}

test('F-01 (a) reauth denied: locked day untouched, nothing changed toast', async () => {
  const c = setup(false, lockedDay());
  const before = c.mem.get(KEY());
  const incoming = dayRecord(); incoming.movements.CLASSIC.sales = 2;
  await c.pickFile(fileFor(incoming));
  assert.equal(c.mem.get(KEY()), before);
  assert.equal(c.reauth.labels.length, 1);
  assert.ok(c.toastText().some(t => t.includes('Nothing was changed')));
});

test('F-01 (b) reauth approved: replaced, one reopenLog entry per locked section, count incremented', async () => {
  const c = setup(true, lockedDay());
  const incoming = dayRecord(); incoming.movements.CLASSIC.sales = 2;
  await c.pickFile(fileFor(incoming));
  const rec = JSON.parse(c.mem.get(KEY()));
  assert.equal(rec.movements.CLASSIC.sales, 2);
  const mine = rec.reopenLog.filter(e => e.reason === 'Locked day replaced by file import');
  assert.equal(mine.length, 3);
  assert.deepEqual(mine.map(e => e.section).sort(), ['closing', 'movements', 'opening']);
  assert.equal(rec.reopenedCount, 3);
  assert.equal(c.reauth.labels.length, 1);
});

test('F-01 (c) unlocked or missing day: no PIN prompt', async () => {
  const c = setup(false, dayRecord());
  const incoming = dayRecord(); incoming.movements.CLASSIC.sales = 4;
  await c.pickFile(fileFor(incoming));
  assert.equal(c.reauth.labels.length, 0);
  assert.equal(JSON.parse(c.mem.get(KEY())).movements.CLASSIC.sales, 4);
  const d = setup(false, null);
  await d.pickFile(fileFor(dayRecord()));
  assert.equal(d.reauth.labels.length, 0);
  assert.ok(d.mem.has(KEY()));
});

test('F-01 (d) full backup: 2 locked + 1 unlocked, denied: unlocked imported, locked kept, one prompt', async () => {
  const k1 = 'saagar_stock_titanworld_2026-01-01', k2 = 'saagar_stock_titanworld_2026-01-02', k3 = 'saagar_stock_titanworld_2026-01-03';
  const c = makeCtx({ reauth: false, storage: { [k1]: JSON.stringify(lockedDay()), [k2]: JSON.stringify(lockedDay()) } });
  c.api.st.mode = 'sm';
  const n = () => { const r = dayRecord(); r.movements.CLASSIC.sales = 5; return r; };
  const before1 = c.mem.get(k1), before2 = c.mem.get(k2);
  await c.pickFile(JSON.stringify({ [k1]: n(), [k2]: n(), [k3]: n() }));
  assert.equal(c.mem.get(k1), before1);
  assert.equal(c.mem.get(k2), before2);
  assert.ok(c.mem.has(k3));
  assert.equal(c.reauth.labels.length, 1);
  assert.ok(c.toastText().some(t => /2 locked day/.test(t)));
});
