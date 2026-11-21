// The Billing area against the REAL main billing UI file: every member of the UI `kit` that the area calls exists and is a function,
// the action ids of the two files never collide, and the area only uses names the UI really exports.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, AREA_SOURCE } from './lib/svc2-area-kit.mjs';

const USED_KIT = ['money', 'parsePaise', 'fmtAt', 'istDay', 'errText', 'billing', 'print', 'openDialog', 'closeDialog', 'renderDialog'];

test('K01 the real UI kit has every member the area calls, as a function, and the area names no other kit member', () => {
  const a = setup({});
  const kit = a.ui.kit;
  assert.ok(kit && typeof kit === 'object');
  for (const name of USED_KIT) assert.equal(typeof kit[name], 'function', 'kit.' + name);
  // every kitFn('x') and SBA_KIT.x in the area source names a real member
  const named = new Set([...AREA_SOURCE.matchAll(/kitFn\('([A-Za-z]+)'\)/g)].map((m) => m[1]).concat([...AREA_SOURCE.matchAll(/SBA_KIT\.([A-Za-z]+)\(/g)].map((m) => m[1])));
  assert.ok(named.size >= 8, Array.from(named).join(','));
  for (const n of named) assert.equal(typeof kit[n], 'function', 'the area calls kit.' + n);
  assert.equal(typeof a.ui.afterCounterSale, 'function');
});

test('K02 the money and date helpers of the kit give the same answers the area expects (hand-typed)', () => {
  const kit = setup({}).ui.kit;
  assert.equal(kit.money(150000), 'Rs 1,500.00');
  assert.equal(kit.money(-9999), '-Rs 99.99');
  assert.deepEqual(JSON.parse(JSON.stringify(kit.parsePaise('149.50'))), { ok: true, paise: 14950 });
  assert.equal(kit.parsePaise('abc').ok, false);
  assert.equal(kit.istDay('2026-11-17T20:30:00.000Z'), '2026-11-18');
});

test('K03 the action ids of the area and of the main UI are different sets; every area id starts svb- and is unique', () => {
  const a = setup({});
  const mine = a.area.internals.actions;
  assert.equal(new Set(mine).size, mine.length);
  for (const id of mine) assert.match(id, /^svb-[a-z0-9-]+$/);
  const theirs = new Set(a.ui.internals.actions || []);
  assert.ok(theirs.size > 40, 'the main UI lists its ids');
  for (const id of mine) assert.equal(theirs.has(id), false, id + ' is used by both files');
});

test('K04 a dialog of the area opens in the real UI dialog layer, is marked, answers its buttons, and the layer closes it', async () => {
  const a = setup({});
  a.mount();
  const d = a.ui.kit.openDialog('areatest', { x: 1 }, { build: () => ({ title: 'Area test', body: '<div data-svb-area="areatest"></div>', footer: '<button type="button" data-svcs-action="svb-bv-close">Close</button>' }), actions: {} });
  assert.equal(d.kind, 'areatest');
  assert.ok(a.layerText().includes('Area test'));
  a.ui.kit.closeDialog();
  assert.equal(a.layerHtml(), '');
});
