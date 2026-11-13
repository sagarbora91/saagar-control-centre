import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { Ui, M, OWNER, MANAGER, STAFF, plainEscape, settle, FakeHost } from './lib/svc1-mui-harness.mjs';

// Runs the masters UI against the REAL core facade (real store, FIFO, masters and documents layer) over an
// in-memory adapter. Skipped when the core or documents file is not in the tree yet.
const require = createRequire(import.meta.url);
const present = fs.existsSync(new URL('../www/service-stores-core.js', import.meta.url)) && fs.existsSync(new URL('../www/service-stores-docs.js', import.meta.url));
const skip = present ? false : 'core or documents file not present';

function build(session) {
  const Core = require('../www/service-stores-core.js');
  const data = new Map();
  const adapter = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    keys: () => Array.from(data.keys()),
    authoritative: () => true
  };
  let ms = Date.parse('2026-11-13T05:30:00.000Z');
  const now = () => new Date(ms);
  const libs = { store: require('../www/service-stores-store.js'), fifo: require('../www/service-stores-fifo.js'), masters: M, docs: require('../www/service-stores-docs.js') };
  const created = Core.create({ adapter, now, cases: { get: () => null }, libs, storeOptions: { watermark: false } });
  assert.equal(created.ok, true, JSON.stringify(created));
  const sess = { current: session };
  const log = { toasts: [], pins: [], changes: 0 };
  const env = {
    core: created.core, masters: M, readSession: () => sess.current, esc: plainEscape, now,
    toast: (m) => log.toasts.push(m), reauth: (l) => { log.pins.push(l); return Promise.resolve(true); }, onChange: () => { log.changes += 1; }
  };
  return { env, sess, log, data, tick: (n) => { ms += n; }, core: created.core };
}

test('real core: create, list, open, edit with reason, deactivate, delete with PIN', { skip }, async () => {
  const b = build(OWNER);
  const host = new FakeHost();
  const ctl = Ui.mount(host, b.env);
  await settle();
  host.fire('click', host.one('svcm-add'));
  await settle();
  const set = (name, value) => { const el = host.byName(name); el.value = value; host.fire(el.tagName === 'SELECT' ? 'change' : 'input', el); };
  set('code', 'TST0001'); set('name', 'Battery 377 (invented)'); set('group', 'Battery'); set('price', '150'); set('basis', 'yes');
  set('tax', '9113'); set('gst', '18'); set('reorderLevel', '5'); set('reorderQty', '10');
  await settle();
  host.fire('click', host.one('svcm-save'));
  await settle(10);
  assert.equal(ctl.state.view, 'list');
  assert.ok(host.text().includes('TST0001'));
  assert.ok(Array.from(b.data.keys()).some((k) => /^saagar_svcs_parts_v1/.test(k)), 'written through the real store');
  assert.equal(b.log.changes, 1);
  // open: detail, history, no delete missing (no movements), fresh row
  host.fire('click', host.one('svcm-open', 'TST0001'));
  await settle(10);
  assert.equal(ctl.state.view, 'detail');
  assert.equal(ctl.state.detail.hasMovements, false);
  assert.ok(host.text().includes('Item created'));
  assert.ok(host.text().includes('Created 2026-11-13 11:00'), host.text());
  // edit price: reason needed
  host.fire('click', host.one('svcm-edit', 'TST0001'));
  await settle(10);
  set('price', '175.00');
  await settle();
  assert.ok(host.byName('reason'));
  host.fire('click', host.one('svcm-save'));
  await settle(10);
  assert.ok(host.text().includes('A reason of at least 5 characters is required.'));
  set('reason', 'supplier changed the price');
  await settle();
  host.fire('click', host.one('svcm-save'));
  await settle(10);
  assert.ok(host.text().includes('Saved.'));
  // deactivate and reactivate
  host.fire('click', host.one('svcm-open', 'TST0001'));
  await settle(10);
  const dr = host.byId('svcm-dr');
  dr.value = 'no longer sold';
  host.fire('input', dr);
  host.fire('click', host.one('svcm-deactivate', 'TST0001'));
  await settle(12);
  assert.ok(host.text().includes('Inactive'));
  // delete needs the PIN and works because there are no movements
  const dr2 = host.byId('svcm-dr');
  dr2.value = 'created by mistake';
  host.fire('input', dr2);
  host.fire('click', host.one('svcm-delete', 'TST0001'));
  await settle(14);
  assert.equal(b.log.pins.length, 1);
  assert.equal(ctl.state.view, 'list');
  assert.equal(ctl.state.list.rows.length, 0);
});

test('real core: manager cannot delete and staff cannot change; bulk create works', { skip }, async () => {
  const b = build(MANAGER);
  const ctl = Ui.create(b.env);
  await ctl.refresh();
  await ctl.dispatch('svcm-bulk-open');
  await ctl.dispatch('svcm-bulk-check');
  assert.equal(ctl.state.bulk.plan.ok, true, JSON.stringify(ctl.state.bulk.plan));
  await ctl.dispatch('svcm-bulk-create');
  assert.equal(ctl.state.list.rows.length, 1);
  assert.ok(ctl.render().includes('1 item created.'));
  await ctl.dispatch('svcm-open', { code: 'TST0001', kind: 'part' });
  assert.equal(ctl.render().includes('"svcm-delete"'), false);
  b.sess.current = STAFF;
  assert.equal(ctl.render().includes('"svcm-edit"'), false);
  const before = JSON.stringify(Array.from(b.data.entries()));
  await ctl.dispatch('svcm-deactivate', { code: 'TST0001', reason: 'not needed any more' });
  assert.equal(JSON.stringify(Array.from(b.data.entries())), before);
  assert.equal(b.log.pins.length, 0);
});

test('real core: a part with a stock movement cannot be deleted (HAS_MOVEMENTS before the PIN)', { skip }, async () => {
  const b = build(OWNER);
  const ctl = Ui.create(b.env);
  const mk = b.core.savePart({ mode: 'create', code: 'TST0001', name: 'Battery', group: 'Battery', unit: 'pc', sellPricePaise: 15000, priceIncludesTax: true }, { session: OWNER, clientRef: 'svs-test-001' });
  assert.equal(mk.ok, true, JSON.stringify(mk));
  const opn = b.core.proposeOpening({ lines: [{ partCode: 'TST0001', qty: 5, unitCostPaise: 10000 }], note: 'opening' }, { session: OWNER, clientRef: 'svs-test-002' });
  assert.equal(opn.ok, true, JSON.stringify(opn));
  const ap = b.core.approveOpening(opn.proposalId, { session: OWNER, clientRef: 'svs-test-003', stepUp: { ok: true, at: Date.parse('2026-11-13T05:30:00.000Z') } });
  assert.equal(ap.ok, true, JSON.stringify(ap));
  await ctl.refresh();
  await ctl.dispatch('svcm-open', { code: 'TST0001', kind: 'part' });
  assert.equal(ctl.state.detail.hasMovements, true);
  assert.equal(ctl.render().includes('"svcm-delete"'), false);
});
