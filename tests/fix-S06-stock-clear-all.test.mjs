// U05-F-02: Clear Everything needs SM mode and the Owner PIN, is logged, and is chunked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCtx, dayRecord } from './lib/fix-S06-stock-vm.mjs';

const lockedDay = () => dayRecord({ openingLocked: true });
const today = () => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
function seed() {
  return {
    'saagar_stock_titanworld_2026-01-01': JSON.stringify(lockedDay()),
    'saagar_stock_titanworld_2026-01-02': JSON.stringify(dayRecord()),
    'saagar_stock_helios_2026-01-01': JSON.stringify(dayRecord()),
    saagar_brands: '{"titanworld":["CLASSIC"]}', saagar_cros: '["A"]', saagar_appstate: '{}',
  };
}
async function run(c, typed = 'DELETE') {
  c.els['del-inp'] = c.els['del-inp'] || c.sandbox.document.getElementById('del-inp');
  c.els['del-inp'].value = typed;
  await c.api.delConfirmSubmit();
}

test('F-02 (a) CRO mode: nothing removed, only-SM toast', async () => {
  const c = makeCtx({ storage: seed() }); c.api.st.mode = 'cro';
  await run(c);
  assert.equal(c.mem.size, 6);
  assert.ok(c.toastText().some(t => t.includes('Only SM')));
});

test('F-02 (b) denied PIN: everything kept, no clear log', async () => {
  const c = makeCtx({ storage: seed(), reauth: false }); c.api.st.mode = 'sm';
  await run(c);
  assert.equal(c.mem.size, 6);
  assert.equal(c.mem.has('saagar_stk_clearlog_v1'), false);
  assert.equal(c.reauth.labels.length, 1);
});

test('F-02 (c)(d) approved: stock keys gone, others kept, log correct, PIN before first removal', async () => {
  const c = makeCtx({ storage: seed(), reauth: true }); c.api.st.mode = 'sm';
  await run(c);
  assert.deepEqual([...c.mem.keys()].filter(k => k.startsWith('saagar_stock_')), []);
  for (const k of ['saagar_brands', 'saagar_cros', 'saagar_appstate']) assert.ok(c.mem.has(k), k);
  const log = JSON.parse(c.mem.get('saagar_stk_clearlog_v1'));
  assert.equal(log.length, 1);
  assert.equal(log[0].scope, 'all'); assert.equal(log[0].records, 3); assert.equal(log[0].locked, 1);
  assert.deepEqual(log[0].stores, { titanworld: 2, helios: 1 });
  assert.equal(log[0].done, true); assert.equal(log[0].removed, 3);
  assert.equal(c.reauth.labels.length, 1);
  const firstRemove = c.log.findIndex(e => e.startsWith('remove:'));
  const reauthAt = c.log.findIndex(e => e.startsWith('reauth:'));
  const logSetAt = c.log.findIndex(e => e === 'set:saagar_stk_clearlog_v1');
  assert.ok(reauthAt >= 0 && reauthAt < logSetAt && logSetAt < firstRemove);
});

test('F-02 log must be written before deleting: write failure keeps the data', async () => {
  const c = makeCtx({ storage: seed(), reauth: true, failSet: k => k === 'saagar_stk_clearlog_v1' }); c.api.st.mode = 'sm';
  await run(c);
  assert.equal(c.mem.size, 6);
  assert.ok(c.toastText().some(t => t.includes('Nothing was deleted')));
});

test('F-02 uses the store bulkAsync path when present', async () => {
  const c = makeCtx({ storage: seed(), reauth: true }); c.api.st.mode = 'sm';
  let called = 0;
  c.win.parent = { SaagarStore: { bulkAsync: fn => { called++; return Promise.resolve().then(fn); } } };
  await run(c);
  assert.equal(called, 1);
  assert.deepEqual([...c.mem.keys()].filter(k => k.startsWith('saagar_stock_')), []);
});

test('F-02 (e) clearDay: locked day denied keeps record; unlocked removed with confirm only', async () => {
  const day = 'saagar_stock_titanworld_' + today();
  const c = makeCtx({ storage: { [day]: JSON.stringify(lockedDay()) }, reauth: false }); c.api.st.mode = 'sm';
  await c.api.clearDay();
  assert.ok(c.mem.has(day));
  assert.equal(c.reauth.labels.length, 1);
  const u = makeCtx({ storage: { [day]: JSON.stringify(dayRecord()) }, reauth: false }); u.api.st.mode = 'sm';
  await u.api.clearDay();
  assert.equal(u.mem.has(day), false);
  assert.equal(u.reauth.labels.length, 0);
});

test('F-02 clearDay on a locked day with approval writes a log entry first', async () => {
  const day = 'saagar_stock_titanworld_' + today();
  const c = makeCtx({ storage: { [day]: JSON.stringify(lockedDay()) }, reauth: true }); c.api.st.mode = 'sm';
  await c.api.clearDay();
  assert.equal(c.mem.has(day), false);
  const log = JSON.parse(c.mem.get('saagar_stk_clearlog_v1'));
  assert.equal(log[0].scope, 'day'); assert.equal(log[0].locked, 1);
  assert.ok(c.log.indexOf('set:saagar_stk_clearlog_v1') < c.log.indexOf('remove:' + day));
});
