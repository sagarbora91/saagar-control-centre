// Audit probes for the masters UI: hostile payloads and races that the writer's tests did not cover.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHarness, M, OWNER } from './lib/svc1-mui-harness.mjs';

async function openPart(h, code) {
  await h.load();
  await h.act('svcm-open', { code, kind: 'part' });
  await h.act('svcm-detail-reason', { value: 'created by mistake' });
}

test('H1. delete: a payload kind that differs from the open detail is refused before the PIN', async () => {
  const h = makeHarness({ session: OWNER });
  h.seed('TST0001');
  h.seedLabour('TST0001');
  await openPart(h, 'TST0001');
  await h.act('svcm-delete', { code: 'TST0001', kind: 'labour' });
  assert.equal(h.state.reauthCalls.length, 0, 'no PIN for a kind that is not on screen');
  assert.equal(h.count('removeLabour'), 0);
  assert.equal(h.count('removePart'), 0);
  assert.equal(M.getRow(h.env.store, 'labour', 'TST0001').ok, true);
});

test('H2. delete: the core gets the code of the open detail, not the raw payload text', async () => {
  const h = makeHarness({ session: OWNER });
  h.seed('TST0001');
  await openPart(h, 'TST0001');
  await h.act('svcm-delete', { code: ' tst0001 ' });
  const call = h.last('removePart');
  assert.ok(call, 'delete went through');
  assert.equal(call.args[0], 'TST0001');
  const pre = h.last('ledger');
  assert.equal(pre.args[0], 'TST0001');
});

test('H3. delete: a past-date view switched on while the keypad is open stops the core call', async () => {
  const h = makeHarness({ session: OWNER });
  h.seed('TST0001');
  await openPart(h, 'TST0001');
  h.state.reauthResult = () => { h.state.past = true; return Promise.resolve(true); };
  await h.act('svcm-delete', { code: 'TST0001' });
  assert.equal(h.count('removePart'), 0);
  assert.ok(h.host.text().includes('You are viewing a past date.'));
  assert.equal(h.ctl.state.busy, false);
  assert.equal(M.getRow(h.env.store, 'part', 'TST0001').ok, true);
});

test('H4. a slow detail load does not throw away a form the user opened meanwhile', async () => {
  const h = makeHarness({ session: OWNER });
  h.seed('TST0001');
  await h.load();
  let release;
  const gate = new Promise((r) => { release = r; });
  const orig = h.core.getPart;
  h.core.getPart = (...a) => gate.then(() => orig(...a));
  const opening = h.ctl.dispatch('svcm-open', { code: 'TST0001', kind: 'part' });
  await h.ctl.dispatch('svcm-add', { kind: 'part' });
  await h.ctl.dispatch('svcm-field', { name: 'name', value: 'typed by hand' });
  release();
  await opening;
  h.paint();
  assert.equal(h.ctl.state.view, 'form');
  assert.equal(h.ctl.state.form.values.name, 'typed by hand');
});

test('H5. hostile codes and names stay inert in markup', async () => {
  const h = makeHarness({ session: OWNER });
  const res = M.createRow(h.env.store, h.env.ctx(OWNER, { clientRef: h.env.ref() }), 'part',
    { code: 'X1', name: '"><img src=x onerror=1>`\'', group: '<b>g</b>', unit: 'pc', hsn: '', gstRateBp: null, priceIncludesTax: null, sellPricePaise: 0, reorderLevel: 0, reorderQty: 0, bin: '', flags: {} });
  assert.equal(res.ok, true, String(res.code));
  await h.load();
  const html = h.ctl.render();
  assert.ok(!/<img/i.test(html));
  assert.ok(!/<b>g/.test(html));
  await h.act('svcm-open', { code: 'X1', kind: 'part' });
  assert.ok(!/<img/i.test(h.ctl.render()));
});

test('H6. a hostile env.esc that escapes nothing still cannot break out of an attribute', async () => {
  const h = makeHarness({ session: OWNER });
  h.uiEnv.esc = (v) => v;
  const ctl = (await import('../www/service-stores-masters-ui.js')).default.create(h.uiEnv);
  ctl.state.q = '" onfocus="x';
  const html = ctl.render();
  assert.ok(!html.includes('" onfocus="x'));
});
