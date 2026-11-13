import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { makeHarness, Ui, M, OWNER, MANAGER, STAFF, FakeHost, settle, plainEscape } from './lib/svc1-mui-harness.mjs';
import { FakeElement } from './lib/svc1-mui-dom.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const www = path.join(here, '..', 'www');

function mounted(session = OWNER, seedFn) {
  const h = makeHarness({ session });
  if (seedFn) seedFn(h);
  const host = new FakeHost();
  const ctl = Ui.mount(host, h.uiEnv);
  return { h, host, ctl };
}

test('mount: renders at once, registers exactly one click, input and change listener, loads the list', async () => {
  const { host, ctl, h } = mounted(OWNER, (x) => x.seed('TST0001'));
  assert.ok(host.innerHTML.includes('Parts and labour'));
  assert.deepEqual(host.listeners.map((l) => l.type).sort(), ['change', 'click', 'input']);
  assert.ok(host.innerHTML.includes('Loading...'));
  await settle();
  assert.ok(host.text().includes('TST0001'));
  assert.equal(typeof ctl.openNew, 'function');
  assert.equal(typeof ctl.openEdit, 'function');
  assert.equal(h.count('listParts'), 1);
});

test('mount: a second mount on the same host removes the first listeners; destroy removes all and stops painting', async () => {
  const { host, ctl, h } = mounted();
  const again = Ui.mount(host, h.uiEnv);
  assert.equal(host.listeners.length, 3);
  assert.deepEqual(host.removed.sort(), ['change', 'click', 'input']);
  again.destroy();
  assert.equal(host.listeners.length, 0);
  const renders = host.renders;
  await ctl.dispatch('svcm-tab-labour');
  assert.equal(host.renders, renders, 'a destroyed screen never paints');
  assert.equal(host.svcmController, null);
});

test('mount without a host element returns a controller and touches nothing', () => {
  const h = makeHarness();
  const ctl = Ui.mount(null, h.uiEnv);
  assert.equal(typeof ctl.dispatch, 'function');
});

test('events: clicks route by the nearest data-svcs-action, parents are walked, strangers are ignored', async () => {
  const { host, h, ctl } = mounted(OWNER, (x) => { x.seed('TST0001'); x.seedLabour('TSTL001'); });
  await settle();
  // a click on a child of the Labour tab button
  const tab = host.one('svcm-tab-labour');
  const child = new FakeElement('span', {}, tab);
  tab.children.push(child);
  host.fire('click', child);
  await settle();
  assert.equal(ctl.state.kind, 'labour');
  host.fire('click', host.one('svcm-tab-parts'));
  await settle();
  assert.equal(ctl.state.kind, 'part');
  // open a row
  host.fire('click', host.one('svcm-open', 'TST0001'));
  await settle();
  assert.equal(ctl.state.view, 'detail');
  assert.equal(ctl.state.detailCode, 'TST0001');
  // strangers: other namespaces, plain data-action, no attribute, text nodes, null
  const before = h.core.calls.length;
  const stranger = new FakeElement('button', { 'data-svcs-action': 'svs-open-stores' }, host.root);
  const legacy = new FakeElement('button', { 'data-action': 'svcm-add' }, host.root);
  const plain = new FakeElement('div', {}, host.root);
  for (const el of [stranger, legacy, plain, null, undefined]) host.fire('click', el);
  host.fire('click', undefined);
  await settle();
  assert.equal(h.core.calls.length, before);
});

test('events: typing updates state without repainting, except when the reason box has to appear or go', async () => {
  const { host, h, ctl } = mounted(MANAGER, (x) => x.seed('TST0001', { hsn: '9113', gstRateBp: 1800 }));
  await settle();
  host.fire('click', host.one('svcm-open', 'TST0001'));
  await settle();
  host.fire('click', host.one('svcm-edit', 'TST0001'));
  await settle();
  const name = host.byName('name');
  name.value = 'Renamed';
  const renders = host.renders;
  host.fire('input', name);
  await settle();
  assert.equal(host.renders, renders, 'a plain text edit does not repaint (focus is kept)');
  assert.equal(ctl.state.form.values.name, 'Renamed');
  const price = host.byName('price');
  price.value = '99.00';
  host.fire('input', price);
  await settle();
  assert.equal(host.renders, renders + 1, 'repaint when the reason box appears');
  assert.ok(host.byName('reason'));
  assert.equal(host.byName('name').value, 'Renamed', 'the typed value survives the repaint');
  assert.equal(host.byName('price').value, '99.00');
});

test('events: focus and caret return to the field after a repaint', async () => {
  const { host } = mounted(MANAGER, (x) => x.seed('TST0001', { hsn: '9113', gstRateBp: 1800 }));
  await settle();
  host.fire('click', host.one('svcm-open', 'TST0001'));
  await settle();
  host.fire('click', host.one('svcm-edit', 'TST0001'));
  await settle();
  const log = [];
  const savedFocus = FakeElement.prototype.focus;
  const savedRange = FakeElement.prototype.setSelectionRange;
  FakeElement.prototype.focus = function () { log.push('focus:' + this.getAttribute('data-svcm-name')); host.activeElement = this; };
  FakeElement.prototype.setSelectionRange = function (a) { log.push('caret:' + a); };
  try {
    const price = host.byName('price');
    price.selectionStart = 3;
    host.activeElement = price;
    price.value = '12.50';
    host.fire('input', price);
    await settle();
    assert.deepEqual(log, ['focus:price', 'caret:3']);
  } finally {
    FakeElement.prototype.focus = savedFocus;
    FakeElement.prototype.setSelectionRange = savedRange;
  }
});

test('events: select and checkbox changes route through the change listener only', async () => {
  const { host, h, ctl } = mounted(OWNER, (x) => { x.seed('TST0001', { group: 'Battery' }); x.seed('TST0002', { group: 'Strap' }); });
  await settle();
  const sel = host.one('svcm-filter-group');
  sel.value = 'Strap';
  host.fire('click', sel);
  await settle();
  assert.equal(ctl.state.group, '', 'a click on a select does nothing');
  host.fire('input', sel);
  await settle();
  assert.equal(ctl.state.group, '', 'an input event on a select does nothing');
  host.fire('change', sel);
  await settle();
  assert.equal(ctl.state.group, 'Strap');
  assert.deepEqual(ctl.state.list.rows.map((r) => r.code), ['TST0002']);
  // the search box uses input, not change
  const q = host.one('svcm-search');
  q.value = 'zzz';
  host.fire('change', q);
  await settle();
  assert.equal(ctl.state.q, '');
  host.fire('input', q);
  await settle();
  assert.equal(ctl.state.q, 'zzz');
  // checkbox in the form
  host.fire('click', host.one('svcm-add'));
  await settle();
  const cb = host.byName('flags.battery');
  cb.checked = true;
  host.fire('click', cb);
  host.fire('input', cb);
  await settle();
  assert.equal(ctl.state.form.values.flags.battery, false, 'click and input are ignored for a checkbox');
  host.fire('change', cb);
  await settle();
  assert.equal(ctl.state.form.values.flags.battery, true);
});

test('events: a whole create through the DOM, field by field', async () => {
  const { host, h, ctl } = mounted(MANAGER);
  await settle();
  host.fire('click', host.one('svcm-add'));
  await settle();
  const set = (name, value) => { const el = host.byName(name); el.value = value; host.fire(el.tagName === 'SELECT' ? 'change' : 'input', el); };
  set('code', 'TST0001');
  set('name', 'Battery 377 (invented)');
  set('group', 'Battery');
  set('price', '150');
  set('basis', 'yes');
  await settle();
  host.fire('click', host.one('svcm-save'));
  await settle(10);
  assert.equal(ctl.state.view, 'list');
  assert.ok(host.text().includes('TST0001'));
  assert.equal(M.getRow(h.env.store, 'part', 'TST0001').row.sellPricePaise, 15000);
  assert.equal(h.state.changes, 1);
});

test('events: bulk text typed in the box is used by Check', async () => {
  const { host, h, ctl } = mounted(OWNER);
  await settle();
  host.fire('click', host.one('svcm-bulk-open'));
  await settle();
  const box = host.one('svcm-bulk-text');
  box.value = M.TEMPLATE_HEADERS.part.join(',') + '\nTSB001,Ok,Battery,pc,,,10.00,yes,0,0,,';
  host.fire('input', box);
  await settle();
  host.fire('click', host.one('svcm-bulk-check'));
  await settle();
  assert.equal(ctl.state.bulk.plan.ok, true);
  assert.equal(h.last('planBulk').args[1].startsWith('code,name'), true);
});

test('real page load path: global masters in one scope, UI picks it up without env.masters', () => {
  const ctx = vm.createContext({ Promise });
  vm.runInContext(fs.readFileSync(path.join(www, 'service-stores-masters.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(www, 'service-stores-masters-ui.js'), 'utf8'), ctx);
  assert.equal(typeof ctx.SaagarServiceMastersUi.mount, 'function');
  assert.equal(Object.isFrozen(ctx.SaagarServiceMastersUi), true);
  const core = { listParts: () => ({ ok: true, rows: [], total: 0, groups: [] }) };
  const ctl = ctx.SaagarServiceMastersUi.create({ core, readSession: () => OWNER, esc: plainEscape, now: () => new Date(0) });
  assert.ok(ctl.render().includes('Parts and labour'));
  const none = ctx.SaagarServiceMastersUi.create({ core, readSession: () => ({ ok: false, tier: 'none' }), esc: plainEscape });
  assert.ok(none.render().includes('not available for this sign-in'));
});

test('public API: frozen, small, and the action list matches the spec', () => {
  assert.equal(Object.isFrozen(Ui), true);
  assert.deepEqual(Object.keys(Ui).sort(), ['ACTIONS', 'TEXT', 'VERSION', 'create', 'mount', 'phrases']);
  assert.equal(Ui.ACTIONS.length, 24);
  assert.equal(new Set(Ui.ACTIONS).size, 24);
  for (const a of ['svcm-tab-parts', 'svcm-tab-labour', 'svcm-search', 'svcm-filter-group', 'svcm-filter-active', 'svcm-filter-taxpending', 'svcm-add', 'svcm-field',
    'svcm-save', 'svcm-cancel', 'svcm-open', 'svcm-edit', 'svcm-deactivate', 'svcm-reactivate', 'svcm-delete', 'svcm-bulk-open', 'svcm-bulk-text', 'svcm-bulk-check',
    'svcm-bulk-create', 'svcm-bulk-clear']) assert.ok(Ui.ACTIONS.includes(a), a);
});
