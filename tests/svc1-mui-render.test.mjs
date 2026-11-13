import assert from 'node:assert/strict';
import test from 'node:test';
import { makeHarness, makeFakeCore, M, OWNER, MANAGER, STAFF, NONE, Ui, part, labour } from './lib/svc1-mui-harness.mjs';

const ALLOWED_CLASSES = new Set([
  'svs-card', 'svs-row', 'svs-btn', 'svs-btn-primary', 'svs-btn-danger', 'svs-input', 'svs-label', 'svs-num', 'svs-muted',
  'svs-badge', 'svs-error', 'svs-warn', 'svs-notice', 'svs-title', 'svs-sr-only'
]);
const FORBIDDEN_ACTIONS_STAFF = ['svcm-add', 'svcm-edit', 'svcm-bulk-open', 'svcm-delete', 'svcm-deactivate', 'svcm-reactivate', 'svcm-save'];

async function listed(session, seedFn) {
  const h = makeHarness({ session });
  if (seedFn) seedFn(h);
  await h.load();
  return h;
}

test('1. sign-in without a usable session shows only the not-available sentence', async () => {
  for (const s of [NONE, {}, { ok: true }, { ok: true, tier: 'weird' }, { ok: false, tier: 'owner', isOwner: true }]) {
    const h = await listed(s, (x) => x.seed('TST0001'));
    const html = h.ctl.render();
    assert.ok(html.includes('Service stores are not available for this sign-in.'));
    assert.equal(/data-svcs-action|<button|<input|<table/.test(html), false);
  }
  // a reader that returns null or throws nothing but garbage is also fail-closed
  const h = makeHarness({ session: () => null });
  assert.ok(h.ctl.render().includes('not available for this sign-in'));
});

test('2. missing core or masters renders the build-missing sentence, never a half screen', () => {
  const none = Ui.create({ readSession: () => OWNER, esc: String });
  assert.ok(none.render().includes('Stores is not available in this build.'));
  const saved = globalThis.SaagarServiceMasters;
  delete globalThis.SaagarServiceMasters;
  try {
    const h = makeHarness({ noMasters: true });
    assert.ok(h.ctl.render().includes('Stores is not available in this build.'));
    assert.equal(/data-svcs-action/.test(h.ctl.render()), false);
  } finally {
    globalThis.SaagarServiceMasters = saved;
  }
});

test('3. staff sees the list but no change controls anywhere', async () => {
  const h = await listed(STAFF, (x) => { x.seed('TST0001'); x.seed('TST0002'); });
  let html = h.ctl.render();
  assert.ok(html.includes('TST0001') && html.includes('TST0002'));
  for (const a of FORBIDDEN_ACTIONS_STAFF) assert.equal(html.includes('"' + a + '"'), false, a);
  await h.act('svcm-open', { code: 'TST0001', kind: 'part' });
  html = h.ctl.render();
  assert.ok(html.includes('Only a Store Manager or the Owner can change it.'));
  for (const a of FORBIDDEN_ACTIONS_STAFF) assert.equal(html.includes('"' + a + '"'), false, a);
  assert.ok(html.includes('"svcm-back"'));
});

test('4. manager sees add, bulk, edit and deactivate but never delete', async () => {
  const h = await listed(MANAGER, (x) => x.seed('TST0001'));
  let html = h.ctl.render();
  assert.ok(html.includes('"svcm-add"') && html.includes('"svcm-bulk-open"'));
  await h.act('svcm-open', { code: 'TST0001', kind: 'part' });
  html = h.ctl.render();
  assert.ok(html.includes('"svcm-edit"') && html.includes('"svcm-deactivate"'));
  assert.equal(html.includes('"svcm-delete"'), false);
});

test('5. owner sees delete only when the row has no movements', async () => {
  const h = await listed(OWNER, (x) => { x.seed('TST0001'); x.seed('TST0002'); });
  h.core.movements.add('TST0002');
  await h.load();
  await h.act('svcm-open', { code: 'TST0001', kind: 'part' });
  assert.ok(h.ctl.render().includes('"svcm-delete"'));
  await h.act('svcm-back');
  await h.act('svcm-open', { code: 'TST0002', kind: 'part' });
  assert.equal(h.ctl.render().includes('"svcm-delete"'), false);
});

test('6. everything user derived is escaped in text and attributes', async () => {
  const evil = '<img src=x onerror=alert(1)>';
  const h = makeHarness({ session: OWNER });
  h.seed('TST0001', { name: evil, group: '"><script>alert(2)</script>', bin: 'A1' });
  await h.load();
  let html = h.ctl.render();
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('<script'), false);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  await h.act('svcm-open', { code: 'TST0001', kind: 'part' });
  html = h.ctl.render();
  assert.equal(html.includes('<img') || html.includes('<script'), false);
  // a notice built from a hostile message is escaped too
  const h2 = makeHarness({ session: OWNER, hooks: { savePart: () => ({ ok: false, code: 'ZZ_UNKNOWN', message: '<b onmouseover=1>x</b>' }) } });
  await h2.load();
  await h2.act('svcm-add', {});
  await h2.fill({ code: 'TST9', name: 'N', group: 'G' });
  await h2.act('svcm-save');
  html = h2.ctl.render();
  assert.equal(html.includes('<b onmouseover'), false);
  assert.ok(html.includes('&lt;b onmouseover=1&gt;'));
  // a hostile row key cannot break out of the attribute
  const h3 = makeHarness({ session: OWNER, hooks: {
    listParts: () => ({ ok: true, rows: [{ ...part('X1'), code: '"><img src=x>', rev: 1, active: true, taxPending: true, name: 'n', group: 'g' }], total: 1, groups: [] })
  } });
  await h3.load();
  html = h3.ctl.render();
  assert.equal(html.includes('"><img'), false);
});

test('7. list shows the agreed columns, basis text, tax pending and inactive badges', async () => {
  const h = makeHarness({ session: MANAGER, coreOpts: { taxTotal: true } });
  h.seed('TST0001', { name: 'Battery A', hsn: '9113', gstRateBp: 1800, sellPricePaise: 123456, priceIncludesTax: true, reorderLevel: 5, reorderQty: 10, bin: 'A1' });
  h.seed('TST0002', { name: 'Strap B', priceIncludesTax: false, sellPricePaise: 5000 });
  h.seed('TST0003', { name: 'Glass C', sellPricePaise: 0, priceIncludesTax: null });
  await h.load();
  await h.act('svcm-filter-active', { value: 'all' });
  const t = h.ctl.render();
  assert.ok(t.includes('Rs 1,234.56'));
  assert.ok(t.includes('Price includes tax') && t.includes('Price excludes tax') && t.includes('Price basis not set'));
  assert.ok(t.includes('HSN code: 9113') && t.includes('GST rate (%): 18'));
  assert.ok(t.includes('Reorder level: 5 / 10') && t.includes('Bin: A1'));
  assert.ok(t.includes('Tax details missing'));
  assert.ok(/<span class="svs-num">3<\/span> items, <span class="svs-num">2<\/span> need tax details/.test(t));
  // deactivate one and see the badge
  await h.act('svcm-open', { code: 'TST0002', kind: 'part' });
  await h.act('svcm-detail-reason', { value: 'discontinued item' });
  await h.act('svcm-deactivate', { code: 'TST0002' });
  await h.act('svcm-back');
  await h.act('svcm-filter-active', { value: 'all' });
  assert.ok(h.ctl.render().includes('svs-badge">Inactive'));
});

test('8. labour list has sac and rate and no reorder or bin', async () => {
  const h = makeHarness({ session: MANAGER });
  h.seedLabour('TSTL001', { sac: '998729', gstRateBp: 1800, ratePaise: 50000 });
  await h.load();
  await h.act('svcm-tab-labour');
  const t = h.ctl.render();
  assert.ok(t.includes('TSTL001') && t.includes('SAC code: 998729') && t.includes('Labour rate: Rs 500.00'));
  assert.equal(/Reorder level|Bin:/.test(t), false);
  assert.equal(h.last('listLabour').args[0].state, undefined);
});

test('9. filters and paging reach the core as the agreed query', async () => {
  const h = makeHarness({ session: OWNER });
  const batch = [];
  for (let i = 1; i <= 120; i += 1) batch.push(h.seed('TST' + String(i).padStart(4, '0'), { group: i % 2 ? 'Odd' : 'Even' }));
  await h.load();
  let q = h.last('listParts').args[0];
  assert.deepEqual([q.offset, q.limit, q.active, q.group, q.text, q.state], [0, 50, 'true', '', '', 'all']);
  assert.equal(q.taxPending, undefined);
  let t = h.ctl.render();
  assert.ok(t.includes('<span class="svs-num">1</span> to <span class="svs-num">50</span> of <span class="svs-num">120</span>'));
  assert.equal(h.host.innerHTML === '' || t.includes('disabled'), true);
  await h.act('svcm-page-next');
  assert.equal(h.last('listParts').args[0].offset, 50);
  await h.act('svcm-page-next');
  assert.equal(h.last('listParts').args[0].offset, 100);
  await h.act('svcm-page-next');
  assert.equal(h.last('listParts').args[0].offset, 100, 'cannot page past the end');
  await h.act('svcm-page-prev');
  assert.equal(h.last('listParts').args[0].offset, 50);
  await h.act('svcm-filter-group', { value: 'Odd' });
  q = h.last('listParts').args[0];
  assert.deepEqual([q.group, q.offset], ['Odd', 0]);
  await h.act('svcm-filter-taxpending', { value: 'true' });
  assert.equal(h.last('listParts').args[0].taxPending, 'true');
  await h.act('svcm-filter-active', { value: 'bogus' });
  assert.equal(h.last('listParts').args[0].active, 'true', 'unknown filter value falls back');
  await h.act('svcm-search', { value: 'TST0007' });
  assert.equal(h.last('listParts').args[0].text, 'TST0007');
  t = h.ctl.render();
  assert.ok(t.includes('TST0007'));
  batch.length = 0;
});

test('10. a failed list load shows a message and keeps the screen usable', async () => {
  const h = makeHarness({ session: OWNER, hooks: { listParts: () => ({ ok: false, code: 'SVCS_BLOCKED' }) } });
  await h.load();
  const t = h.ctl.render();
  assert.ok(t.includes('The list could not be loaded.'));
  assert.ok(t.includes('Stores data failed its safety check'));
  assert.ok(t.includes('"svcm-tab-labour"'));
});

test('11. every rendered control is an svcm- action with shared svs- classes only', async () => {
  const h = makeHarness({ session: OWNER });
  h.seed('TST0001', { reorderLevel: 2, reorderQty: 3 });
  await h.load();
  const screens = [];
  const grab = () => { h.paint(); screens.push(h.host.innerHTML); };
  grab();
  await h.act('svcm-open', { code: 'TST0001', kind: 'part' }); grab();
  await h.act('svcm-edit', { code: 'TST0001', kind: 'part' }); grab();
  await h.act('svcm-cancel'); grab();
  await h.act('svcm-back'); grab();
  await h.act('svcm-add', { kind: 'part' }); grab();
  await h.act('svcm-cancel');
  await h.act('svcm-bulk-open'); grab();
  await h.act('svcm-bulk-check'); grab();
  await h.act('svcm-tab-labour');
  await h.act('svcm-add', { kind: 'labour' }); grab();
  const seen = new Set();
  for (const html of screens) {
    assert.equal(/data-action=|onclick=|onchange=|oninput=|<script|<form|<iframe|style=/i.test(html), false);
    h.host.innerHTML = html;
    for (const el of h.host.all()) {
      for (const c of el.classes()) assert.ok(ALLOWED_CLASSES.has(c), 'class ' + c);
      const a = el.getAttribute('data-svcs-action');
      if (a !== null) { assert.ok(a.startsWith('svcm-'), a); assert.ok(Ui.ACTIONS.includes(a), a); seen.add(a); }
      if (['BUTTON', 'SELECT', 'TEXTAREA'].includes(el.tagName) || (el.tagName === 'INPUT' && el.type !== 'search' && el.getAttribute('data-svcm-name') === null)) {
        assert.notEqual(a, null, el.tagName + ' without action');
      }
    }
  }
  for (const a of ['svcm-tab-parts', 'svcm-tab-labour', 'svcm-search', 'svcm-add', 'svcm-open', 'svcm-edit', 'svcm-save', 'svcm-cancel', 'svcm-bulk-check']) {
    assert.ok(seen.has(a), 'never rendered: ' + a);
  }
});

test('12. form: reason box appears only when a sensitive field differs from the stored value', async () => {
  const h = makeHarness({ session: MANAGER });
  h.seed('TST0001', { hsn: '9113', gstRateBp: 1800, sellPricePaise: 10000 });
  await h.load();
  await h.act('svcm-edit', { code: 'TST0001', kind: 'part' });
  assert.equal(h.ctl.render().includes('data-svcm-name="reason"'), false);
  await h.ctl.dispatch('svcm-field', { name: 'name', value: 'Changed name only' });
  assert.equal(h.ctl.render().includes('data-svcm-name="reason"'), false, 'name is not sensitive');
  await h.ctl.dispatch('svcm-field', { name: 'price', value: '101.00' });
  assert.ok(h.ctl.render().includes('data-svcm-name="reason"'));
  assert.ok(h.ctl.render().includes('Reason for change'));
  await h.ctl.dispatch('svcm-field', { name: 'price', value: '100.00' });
  assert.equal(h.ctl.render().includes('data-svcm-name="reason"'), false, 'back to the stored value');
  await h.ctl.dispatch('svcm-field', { name: 'gst', value: '12' });
  assert.ok(h.ctl.render().includes('data-svcm-name="reason"'));
  await h.ctl.dispatch('svcm-field', { name: 'gst', value: '18' });
  await h.ctl.dispatch('svcm-field', { name: 'tax', value: '9114' });
  assert.ok(h.ctl.render().includes('data-svcm-name="reason"'));
  await h.ctl.dispatch('svcm-field', { name: 'tax', value: '9113' });
  await h.ctl.dispatch('svcm-field', { name: 'basis', value: 'no' });
  assert.ok(h.ctl.render().includes('data-svcm-name="reason"'));
  await h.ctl.dispatch('svcm-field', { name: 'basis', value: 'yes' });
  await h.ctl.dispatch('svcm-field', { name: 'price', value: 'abc' });
  assert.ok(h.ctl.render().includes('data-svcm-name="reason"'), 'an unreadable price counts as changed');
});

test('13. form: edit makes the code read-only; create keeps it editable; labour has no part fields', async () => {
  const h = makeHarness({ session: OWNER });
  h.seed('TST0001');
  await h.load();
  await h.act('svcm-edit', { code: 'TST0001', kind: 'part' });
  h.paint();
  assert.ok(h.host.byName('code').hasAttribute('readonly'));
  await h.ctl.dispatch('svcm-field', { name: 'code', value: 'HACK' });
  assert.equal(h.ctl.state.form.values.code, 'TST0001', 'a code can never be changed on edit');
  await h.act('svcm-cancel');
  await h.act('svcm-add', { kind: 'part' });
  assert.equal(h.host.byName('code').hasAttribute('readonly'), false);
  await h.ctl.dispatch('svcm-field', { name: 'code', value: 'NEW1' });
  assert.equal(h.ctl.state.form.values.code, 'NEW1');
  await h.act('svcm-cancel');
  await h.act('svcm-tab-labour');
  await h.act('svcm-add', { kind: 'labour' });
  assert.equal(h.host.byName('reorderLevel'), null);
  assert.equal(h.host.byName('flags.battery'), null);
  assert.ok(h.host.byName('tax') && h.host.text().includes('SAC code') && h.host.text().includes('Labour rate'));
});

test('14. detail shows fields, tax note, status, revision and newest history first', async () => {
  const h = makeHarness({ session: OWNER });
  h.seed('TST0001', { name: 'Battery A' });
  await h.load();
  await h.act('svcm-edit', { code: 'TST0001', kind: 'part' });
  await h.ctl.dispatch('svcm-field', { name: 'price', value: '200.00' });
  await h.ctl.dispatch('svcm-field', { name: 'reason', value: 'supplier price change' });
  await h.act('svcm-save');
  await h.act('svcm-open', { code: 'TST0001', kind: 'part' });
  const t = h.host.text();
  assert.ok(t.includes('Tax details missing: this item cannot be used on an estimate or counter sale yet.'));
  assert.ok(t.includes('Revision') && t.includes('History'));
  assert.ok(t.includes('Selling price: Rs 150.00 > Rs 200.00') || t.includes('Rs 150.00 > Rs 200.00'));
  assert.ok(t.includes('supplier price change'));
  assert.ok(t.indexOf('supplier price change') < t.indexOf('Item created'), 'newest first');
  assert.ok(/ IST/.test(t));
});

test('15. money and percent text helpers: Indian grouping', async () => {
  const h = makeHarness({ session: OWNER });
  h.seed('TST0001', { sellPricePaise: 12345678, priceIncludesTax: true });
  h.seed('TST0002', { sellPricePaise: 99, priceIncludesTax: true });
  await h.load();
  const t = h.ctl.render();
  assert.ok(t.includes('Rs 1,23,456.78'));
  assert.ok(t.includes('Rs 0.99'));
});

test('16. fake core sanity: fake core is built on the real masters (labour kind check)', async () => {
  const h = makeHarness({ session: OWNER });
  assert.equal(typeof makeFakeCore, 'function');
  assert.equal(typeof M.rights, 'function');
  assert.equal(labour('TSTL9').sac, '');
  assert.equal(h.ctl.state.kind, 'part');
});

test('17. real core today: no tax-pending total and no tax-pending filter, so the line shows only the count and the page is filtered here', async () => {
  const h = makeHarness({ session: MANAGER });
  h.seed('TST0001', { hsn: '9113', gstRateBp: 1800 });
  h.seed('TST0002');
  await h.load();
  let t = h.ctl.render();
  assert.ok(t.includes('<span class="svs-num">2</span> items'));
  assert.equal(/need tax details/.test(t), false);
  await h.act('svcm-filter-taxpending', { value: 'true' });
  t = h.ctl.render();
  assert.equal(h.last('listParts').args[0].taxPending, 'true');
  assert.ok(t.includes('TST0002') && !t.includes('TST0001'));
});

test('18. staff detail: no history call, no history section, no created or changed lines, fresh row from getPart', async () => {
  const h = makeHarness({ session: STAFF });
  h.seed('TST0001');
  await h.load();
  await h.act('svcm-open', { code: 'TST0001', kind: 'part' });
  assert.equal(h.count('history'), 0);
  assert.equal(h.count('getPart'), 1);
  const t = h.host.text();
  assert.equal(/History|Created|Last changed/.test(t), false);
  assert.ok(t.includes('Revision'));
});

test('19. manager detail: created and last changed come from the history when the part row has no such fields', async () => {
  const h = makeHarness({ session: MANAGER });
  h.seed('TST0001');
  await h.load();
  h.env.clock.tick(3600 * 1000);
  const r = M.setActive(h.env.store, h.env.ctx(OWNER, { clientRef: h.env.ref() }), 'part', 'TST0001', false, 'discontinued', h.core.deps);
  assert.ok(r.ok);
  await h.act('svcm-open', { code: 'TST0001', kind: 'part' });
  const t = h.host.text();
  assert.ok(t.includes('Created 2026-11-13 15:00 Test Owner (Owner)'), t);
  assert.ok(t.includes('Last changed 2026-11-13 16:00 Test Owner (Owner)'), t);
  assert.ok(t.includes('discontinued'), 'the deactivate reason is read from the history');
  assert.ok(t.includes('Inactive'));
});
