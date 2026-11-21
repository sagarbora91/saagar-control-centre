import assert from 'node:assert/strict';
import test from 'node:test';
import { makeHarness, M, OWNER, MANAGER, STAFF, NONE, part, labour } from './lib/svc1-mui-harness.mjs';

const REF_RE = /^svs-[0-9a-z]+-[0-9a-z]+$/;

async function openAdd(h, kind = 'part') {
  await h.load();
  await h.act('svcm-add', { kind });
}
const goodPart = { code: 'TST0001', name: 'Battery 377 (invented)', group: 'Battery', price: '150.00', basis: 'yes' };

test('A. create: converts the form to integer paise, sends one clientRef, refreshes the list and calls onChange', async () => {
  const h = makeHarness({ session: MANAGER });
  await openAdd(h);
  await h.fill({ ...goodPart, gst: '2.5', tax: '9113', reorderLevel: '5', reorderQty: '10', bin: 'A1' });
  await h.ctl.dispatch('svcm-field', { name: 'flags.battery', value: true });
  await h.ctl.dispatch('svcm-field', { name: 'flags.counterSaleable', value: true });
  await h.act('svcm-save');
  const call = h.last('savePart');
  const input = call.args[0];
  assert.equal(input.mode, 'create');
  assert.equal(input.sellPricePaise, 15000);
  assert.equal(input.gstRateBp, 250);
  assert.equal(input.priceIncludesTax, true);
  assert.equal(input.hsn, '9113');
  assert.equal(input.expectedRev, undefined);
  assert.equal(input.flags.battery, true);
  assert.equal(input.flags.counterSaleable, true);
  assert.equal(input.flags.strap, false);
  assert.match(call.args[1].clientRef, REF_RE);
  assert.equal(call.args[1].session.tier, 'manager');
  assert.equal(call.args[1].stepUp, undefined);
  assert.equal(h.ctl.state.view, 'list');
  assert.ok(h.host.text().includes('TST0001'));
  assert.ok(h.host.text().includes('Saved.'));
  assert.equal(h.state.changes, 1);
  assert.deepEqual(h.state.toasts, ['Saved.']);
  const row = M.getRow(h.env.store, 'part', 'TST0001').row;
  assert.equal(row.sellPricePaise, 15000);
  assert.equal(row.gstRateBp, 250);
  assert.equal(row.flags.counterSaleable, true);
});

test('B. invalid entries: field errors sit under the field, nothing is written', async () => {
  const h = makeHarness({ session: OWNER });
  await openAdd(h);
  const before = h.env.snapshot();
  // unreadable money and percent never reach the core
  await h.fill({ ...goodPart, price: 'abc', gst: '101' });
  await h.act('svcm-save');
  assert.equal(h.count('savePart'), 0);
  assert.ok(h.host.byId('svcm-e-price').textContent.includes('Enter an amount in rupees'));
  assert.ok(h.host.byId('svcm-e-gst').textContent.includes('Enter a rate from 0 to 100'));
  assert.equal(h.host.byName('price').getAttribute('aria-invalid'), 'true');
  assert.equal(h.host.byName('price').getAttribute('aria-describedby'), 'svcm-e-price');
  assert.equal(h.env.snapshot(), before);
  // core refusals map to the right field
  await h.fill({ price: '150.00', gst: '' });
  await h.ctl.dispatch('svcm-field', { name: 'code', value: '' });
  await h.act('svcm-save');
  assert.equal(h.count('savePart'), 1);
  assert.ok(h.host.byId('svcm-e-code').textContent.includes('A code is required.'));
  assert.equal(h.ctl.state.view, 'form', 'form stays open');
  await h.fill({ code: 'bad code', name: '' });
  await h.act('svcm-save');
  assert.ok(h.host.byId('svcm-e-code').textContent.includes('The code may use letters'));
  await h.fill({ code: 'TST0001', name: 'N', price: '1.234', unit: 'pc', reorderLevel: '12x' });
  await h.act('svcm-save');
  assert.ok(h.host.byId('svcm-e-price'), 'price shows an error');
  assert.equal(h.env.snapshot(), before, 'storage text unchanged after every refusal');
  assert.equal(h.state.changes, 0);
  // an error toast was shown for each refusal
  assert.ok(h.state.toasts.length >= 3);
});

test('B2. duplicate and zero-variant codes are refused by the core and shown', async () => {
  const h = makeHarness({ session: OWNER });
  h.seed('0012');
  await openAdd(h);
  await h.fill({ ...goodPart, code: '0012' });
  await h.act('svcm-save');
  assert.ok(h.host.byId('svcm-e-code').textContent.includes('already exists'));
  await h.fill({ code: '12' });
  await h.act('svcm-save');
  assert.ok(h.host.byId('svcm-e-code').textContent.includes('leading zeros'));
});

test('C. edit: reason is required for a sensitive change and the revision is sent', async () => {
  const h = makeHarness({ session: MANAGER });
  const seeded = h.seed('TST0001', { hsn: '9113', gstRateBp: 1800 });
  await h.load();
  await h.act('svcm-edit', { code: 'TST0001', kind: 'part' });
  await h.ctl.dispatch('svcm-field', { name: 'price', value: '175.50' });
  await h.act('svcm-save');
  assert.equal(h.count('savePart'), 0, 'no reason, no call');
  assert.ok(h.host.byId('svcm-e-reason').textContent.includes('A reason of at least 5 characters is required.'));
  await h.ctl.dispatch('svcm-field', { name: 'reason', value: 'abc' });
  await h.act('svcm-save');
  assert.equal(h.count('savePart'), 0, 'a short reason is still refused before the call');
  await h.ctl.dispatch('svcm-field', { name: 'reason', value: 'supplier changed the price' });
  await h.act('svcm-save');
  const input = h.last('savePart').args[0];
  assert.equal(input.mode, 'edit');
  assert.equal(input.expectedRev, seeded.rev);
  assert.equal(input.code, 'TST0001');
  assert.equal(input.sellPricePaise, 17550);
  assert.equal(input.reason, 'supplier changed the price');
  assert.equal(M.getRow(h.env.store, 'part', 'TST0001').row.rev, 2);
  assert.equal(h.ctl.state.view, 'list');
});

test('C2. edit without a sensitive change needs no reason; no change at all says so', async () => {
  const h = makeHarness({ session: OWNER });
  h.seed('TST0001');
  await h.load();
  await h.act('svcm-edit', { code: 'TST0001', kind: 'part' });
  await h.act('svcm-save');
  assert.equal(h.ctl.state.notice.type, 'warn');
  assert.ok(h.host.text().includes('Nothing changed.'));
  assert.equal(h.ctl.state.view, 'form');
  await h.ctl.dispatch('svcm-field', { name: 'name', value: 'Renamed battery' });
  await h.act('svcm-save');
  assert.equal(h.last('savePart').args[0].reason, undefined);
  assert.equal(M.getRow(h.env.store, 'part', 'TST0001').row.name, 'Renamed battery');
});

test('C3. stale revision: another screen edited first', async () => {
  const h = makeHarness({ session: OWNER });
  h.seed('TST0001');
  await h.load();
  await h.act('svcm-edit', { code: 'TST0001', kind: 'part' });
  const other = M.editRow(h.env.store, h.env.ctx(OWNER, { clientRef: h.env.ref() }), 'part', 'TST0001', { name: 'Other screen' }, 1, '');
  assert.ok(other.ok);
  await h.ctl.dispatch('svcm-field', { name: 'name', value: 'My screen' });
  await h.act('svcm-save');
  assert.ok(h.host.text().includes('Another screen changed this item. Reload and try again.'));
  assert.equal(M.getRow(h.env.store, 'part', 'TST0001').row.name, 'Other screen');
  assert.equal(h.state.changes, 0);
});

test('D. clientRef: kept for a retry of the same form, new after a save, and a lost write posts once', async () => {
  const h = makeHarness({ session: OWNER });
  await openAdd(h);
  await h.fill(goodPart);
  h.env.failWrites(1);
  await h.act('svcm-save');
  assert.ok(h.ctl.state.view === 'form', 'failed write keeps the form');
  assert.equal(h.ctl.state.notice.type, 'err');
  await h.act('svcm-save');
  const refs = h.core.calls.filter((c) => c.name === 'savePart').map((c) => c.args[1].clientRef);
  assert.equal(refs.length, 2);
  assert.equal(refs[0], refs[1], 'retry of the same form reuses the reference');
  const rows = M.loadMasters(h.env.store).parts;
  assert.equal(rows.length, 1, 'exactly one row');
  // the next form gets a different reference
  await h.act('svcm-add', { kind: 'part' });
  await h.fill({ ...goodPart, code: 'TST0002' });
  await h.act('svcm-save');
  const refs2 = h.core.calls.filter((c) => c.name === 'savePart').map((c) => c.args[1].clientRef);
  assert.notEqual(refs2[2], refs2[0]);
  assert.equal(new Set(refs2).size, 2);
});

test('E. double press: the second press is refused as busy and one record is written', async () => {
  const h = makeHarness({ session: OWNER });
  await openAdd(h);
  await h.fill(goodPart);
  await Promise.all([h.ctl.dispatch('svcm-save'), h.ctl.dispatch('svcm-save')]);
  assert.equal(h.count('savePart'), 1);
  assert.equal(M.loadMasters(h.env.store).parts.length, 1);
  assert.equal(h.ctl.state.busy, false);
  assert.ok(h.state.toasts.includes('Another save is in progress. Wait a moment.'));
});

test('F. staff and signed-out users are refused on every write path; storage never changes', async () => {
  for (const [s, text] of [[STAFF, 'Only a Store Manager or the Owner can change the master.'], [NONE, 'Service stores are not available for this sign-in.']]) {
    const h = makeHarness({ session: OWNER });
    h.seed('TST0001');
    await h.load();
    const before = h.env.snapshot();
    h.state.session = s;
    for (const [a, p] of [['svcm-add', {}], ['svcm-edit', { code: 'TST0001' }], ['svcm-bulk-open', {}], ['svcm-save', {}], ['svcm-deactivate', { code: 'TST0001', reason: 'not needed any more' }],
      ['svcm-delete', { code: 'TST0001', reason: 'created by mistake' }], ['svcm-bulk-check', {}], ['svcm-bulk-create', {}]]) {
      await h.ctl.dispatch(a, p);
    }
    for (const w of ['savePart', 'saveLabour', 'setPartActive', 'removePart', 'planBulk', 'commitBulk']) assert.equal(h.count(w), 0, w);
    assert.equal(h.state.reauthCalls.length, 0);
    assert.equal(h.env.snapshot(), before);
    assert.equal(h.state.changes, 0);
    if (s === NONE) assert.ok(h.state.toasts.every((t) => t === text));
    else assert.ok(h.state.toasts.includes(text) || h.state.toasts.some((t) => t.includes('Owner')));
  }
});

test('G. role is re-read: a downgrade while the form is open refuses the save', async () => {
  const h = makeHarness({ session: MANAGER });
  await openAdd(h);
  await h.fill(goodPart);
  h.state.session = STAFF;
  await h.act('svcm-save');
  assert.equal(h.count('savePart'), 0);
  assert.ok(h.host.text().includes('Only a Store Manager or the Owner can change the master.'));
  h.state.session = MANAGER;
  await h.act('svcm-save');
  assert.equal(h.count('savePart'), 1);
});

test('H. deactivate and reactivate need a 5 character reason and show the stock warning', async () => {
  const h = makeHarness({ session: MANAGER, hooks: undefined });
  h.seed('TST0001');
  h.core.deps.onHand = () => 7;
  await h.load();
  await h.act('svcm-open', { code: 'TST0001', kind: 'part' });
  await h.act('svcm-deactivate', { code: 'TST0001' });
  assert.equal(h.count('setPartActive'), 0);
  assert.ok(h.host.text().includes('A reason of at least 5 characters is required.'));
  await h.act('svcm-detail-reason', { value: 'no longer sold' });
  await h.act('svcm-deactivate', { code: 'TST0001' });
  assert.equal(h.last('setPartActive').args[1], false);
  assert.match(h.last('setPartActive').args[3].clientRef, REF_RE);
  assert.ok(h.host.text().includes('This code has stock on hand. It is now inactive; the stock is still counted.'));
  assert.equal(M.getRow(h.env.store, 'part', 'TST0001').row.active, false);
  assert.equal(h.ctl.state.view, 'detail');
  assert.ok(h.ctl.render().includes('"svcm-reactivate"'));
  await h.act('svcm-detail-reason', { value: 'selling it again' });
  await h.act('svcm-reactivate', { code: 'TST0001' });
  assert.equal(M.getRow(h.env.store, 'part', 'TST0001').row.active, true);
  assert.equal(h.state.changes, 2);
  // deactivating twice is reported, not repeated
  await h.act('svcm-detail-reason', { value: 'second time round' });
  await h.act('svcm-reactivate', { code: 'TST0001' });
  assert.ok(h.host.text().includes('This item is already active.'));
});

test('I. delete follows the Owner PIN pattern: PIN first, session re-read, fresh step-up stamp', async () => {
  const h = makeHarness({ session: OWNER });
  h.seed('TST0001');
  await h.load();
  await h.act('svcm-open', { code: 'TST0001', kind: 'part' });
  const log = [];
  h.uiEnv.reauth = (label) => { log.push('pin'); h.state.reauthCalls.push(label); return Promise.resolve(true); };
  const origRemove = h.core.removePart;
  h.core.removePart = (...a) => { log.push('remove'); return origRemove(...a); };
  await h.act('svcm-detail-reason', { value: 'created by mistake' });
  await h.act('svcm-delete', { code: 'TST0001' });
  assert.deepEqual(log, ['pin', 'remove']);
  const call = h.last('removePart');
  assert.equal(call.args[0], 'TST0001');
  assert.equal(call.args[1], 'created by mistake');
  assert.equal(call.args[2].stepUp.ok, true);
  assert.equal(call.args[2].stepUp.at, h.env.clock.ms());
  assert.equal(call.args[2].session.isOwner, true);
  assert.match(call.args[2].clientRef, REF_RE);
  assert.equal(h.state.reauthCalls.length, 1);
  assert.ok(h.state.reauthCalls[0].length <= 170 && h.state.reauthCalls[0].includes('TST0001'));
  assert.equal(M.getRow(h.env.store, 'part', 'TST0001').ok, false, 'row removed');
  assert.equal(h.ctl.state.view, 'list');
  assert.equal(h.state.changes, 1);
  assert.equal(h.ctl.state.busy, false);
});

test('I2. delete: reason and rights are checked before the PIN is asked', async () => {
  const h = makeHarness({ session: OWNER });
  h.seed('TST0001');
  await h.load();
  await h.act('svcm-open', { code: 'TST0001', kind: 'part' });
  await h.act('svcm-delete', { code: 'TST0001' });
  assert.equal(h.state.reauthCalls.length, 0, 'no reason, no PIN');
  assert.ok(h.host.text().includes('A reason of at least 5 characters is required.'));
  await h.act('svcm-detail-reason', { value: 'created by mistake' });
  h.state.session = MANAGER;
  await h.act('svcm-delete', { code: 'TST0001' });
  assert.equal(h.state.reauthCalls.length, 0, 'manager is turned away before the PIN');
  assert.ok(h.host.text().includes('Only the Owner can do this.'));
  h.state.session = OWNER;
  h.state.past = true;
  await h.act('svcm-delete', { code: 'TST0001' });
  assert.equal(h.state.reauthCalls.length, 0);
  assert.ok(h.host.text().includes('You are viewing a past date.'));
  assert.equal(h.count('removePart'), 0);
});

test('I3. delete: a refused, rejected or odd PIN reply never reaches the core', async () => {
  for (const result of [false, undefined, null, 0, 'yes', 1, {}, () => Promise.reject(new Error('keypad closed')), () => { throw new Error('boom'); }]) {
    const h = makeHarness({ session: OWNER });
    h.seed('TST0001');
    await h.load();
    await h.act('svcm-open', { code: 'TST0001', kind: 'part' });
    await h.act('svcm-detail-reason', { value: 'created by mistake' });
    const before = h.env.snapshot();
    h.state.reauthResult = typeof result === 'function' ? result : result;
    await h.act('svcm-delete', { code: 'TST0001' });
    assert.equal(h.count('removePart'), 0, 'no core call for ' + String(result));
    assert.equal(h.env.snapshot(), before);
    assert.ok(h.host.text().includes('Owner approval was not given. Nothing was changed.'));
    assert.equal(h.ctl.state.busy, false);
    assert.equal(h.state.changes, 0);
  }
});

test('I4. delete: session downgraded while the keypad was open is refused', async () => {
  const h = makeHarness({ session: OWNER });
  h.seed('TST0001');
  await h.load();
  await h.act('svcm-open', { code: 'TST0001', kind: 'part' });
  await h.act('svcm-detail-reason', { value: 'created by mistake' });
  h.state.reauthResult = () => { h.state.session = MANAGER; return Promise.resolve(true); };
  await h.act('svcm-delete', { code: 'TST0001' });
  assert.equal(h.count('removePart'), 0);
  assert.ok(h.host.text().includes('Only the Owner can do this.'));
  assert.equal(M.getRow(h.env.store, 'part', 'TST0001').ok, true);
  // an owner session whose isOwner flag was dropped is also refused
  h.state.reauthResult = () => { h.state.session = { ...OWNER, isOwner: false }; return Promise.resolve(true); };
  h.state.session = OWNER;
  await h.act('svcm-delete', { code: 'TST0001' });
  assert.equal(h.count('removePart'), 0);
});

test('I5. delete: a part with stock movements is refused before the PIN; a failed ledger check is refused too', async () => {
  const h = makeHarness({ session: OWNER });
  h.seed('TST0001');
  await h.load();
  await h.act('svcm-open', { code: 'TST0001', kind: 'part' });
  await h.act('svcm-detail-reason', { value: 'created by mistake' });
  h.core.movements.add('TST0001');
  await h.act('svcm-delete', { code: 'TST0001' });
  assert.equal(h.state.reauthCalls.length, 0);
  assert.equal(h.count('removePart'), 0);
  assert.ok(h.host.text().includes('This item has stock movements. It can be deactivated but not deleted.'));
  h.core.movements.delete('TST0001');
  h.core.ledger = () => ({ ok: false, code: 'SVCS_BLOCKED' });
  await h.act('svcm-delete', { code: 'TST0001' });
  assert.equal(h.state.reauthCalls.length, 0);
  assert.equal(h.count('removePart'), 0);
  assert.ok(h.host.text().includes('safety check'));
  assert.equal(h.ctl.state.busy, false);
});

test('I6. delete: references are caught by the core after the PIN and shown; labour uses its own call', async () => {
  const h = makeHarness({ session: OWNER });
  h.seed('TST0001');
  h.core.deps.isReferenced = () => true;
  await h.load();
  await h.act('svcm-open', { code: 'TST0001', kind: 'part' });
  await h.act('svcm-detail-reason', { value: 'created by mistake' });
  await h.act('svcm-delete', { code: 'TST0001' });
  assert.equal(h.state.reauthCalls.length, 1);
  assert.ok(h.host.text().includes('It can be deactivated but not deleted.'));
  assert.equal(M.getRow(h.env.store, 'part', 'TST0001').ok, true);
  // labour
  const l = makeHarness({ session: OWNER });
  l.seedLabour('TSTL001');
  await l.load();
  await l.act('svcm-tab-labour');
  await l.act('svcm-open', { code: 'TSTL001', kind: 'labour' });
  await l.act('svcm-detail-reason', { value: 'created by mistake' });
  await l.act('svcm-delete', { code: 'TSTL001', kind: 'labour' });
  assert.equal(l.count('removeLabour'), 1);
  assert.equal(l.count('removePart'), 0);
  assert.equal(M.getRow(l.env.store, 'labour', 'TSTL001').ok, false);
  assert.ok(l.state.reauthCalls[0].includes('labour item'));
});

test('J. bulk: example is valid, create is disabled until a clean check, one click creates, count is plain English', async () => {
  const h = makeHarness({ session: MANAGER });
  await h.load();
  await h.act('svcm-bulk-open');
  assert.ok(h.host.text().includes('Paste rows below. The first line must be exactly the header shown.'));
  assert.ok(h.host.text().includes(M.TEMPLATE_HEADERS.part.join(',')));
  assert.equal(h.host.one('svcm-bulk-create').hasAttribute('disabled'), true);
  await h.act('svcm-bulk-check');
  assert.equal(h.ctl.state.bulk.plan.ok, true, 'the shipped example parses against an empty store');
  assert.equal(h.host.one('svcm-bulk-create').hasAttribute('disabled'), false);
  await h.act('svcm-bulk-create');
  assert.equal(h.ctl.state.view, 'list');
  assert.ok(h.host.text().includes('1 item created.'));
  assert.equal(M.loadMasters(h.env.store).parts.length, 1);
  assert.equal(h.state.changes, 1);
  assert.match(h.last('commitBulk').args[1].clientRef, REF_RE);
  // many rows
  await h.act('svcm-bulk-open');
  const rows = [M.TEMPLATE_HEADERS.part.join(',')];
  for (let i = 0; i < 12; i += 1) rows.push('TSB' + String(i).padStart(3, '0') + ',Invented ' + i + ',Battery,pc,,,10.00,yes,1,2,A1,battery');
  await h.act('svcm-bulk-text', { value: rows.join('\n') });
  await h.act('svcm-bulk-check');
  await h.act('svcm-bulk-create');
  assert.ok(h.host.text().includes('12 items created.'));
  assert.equal(M.loadMasters(h.env.store).parts.length, 13);
});

test('J2. bulk: bad rows show line numbers, create stays disabled, text change drops the plan', async () => {
  const h = makeHarness({ session: OWNER });
  await h.load();
  await h.act('svcm-bulk-open');
  const head = M.TEMPLATE_HEADERS.part.join(',');
  const text = [head, 'TSB001,Ok,Battery,pc,,,10.00,yes,0,0,,', 'TSB002,,Battery,pc,,,10.00,yes,0,0,,', 'TSB003,Bad price,Battery,pc,,,12.345,yes,0,0,,'].join('\n');
  await h.act('svcm-bulk-text', { value: text });
  await h.act('svcm-bulk-check');
  const t = h.host.text();
  assert.ok(/Line 3/.test(t) && /Line 4/.test(t), t);
  assert.equal(h.host.one('svcm-bulk-create').hasAttribute('disabled'), true);
  const before = h.env.snapshot();
  await h.act('svcm-bulk-create');
  assert.equal(h.count('commitBulk'), 0, 'a failed plan is never committed');
  assert.equal(h.env.snapshot(), before);
  // fix and re-check
  await h.act('svcm-bulk-text', { value: [head, 'TSB001,Ok,Battery,pc,,,10.00,yes,0,0,,'].join('\n') });
  assert.equal(h.ctl.state.bulk.plan, null);
  await h.act('svcm-bulk-check');
  assert.equal(h.ctl.state.bulk.plan.ok, true);
  await h.act('svcm-bulk-clear');
  assert.equal(h.ctl.state.bulk.text, '');
  assert.equal(h.ctl.state.bulk.plan, null);
});

test('J3. bulk: header problems, customer columns, stale plan and double press', async () => {
  const h = makeHarness({ session: OWNER });
  await h.load();
  await h.act('svcm-bulk-open');
  await h.act('svcm-bulk-text', { value: 'code,name\nA1,B' });
  await h.act('svcm-bulk-check');
  assert.ok(h.host.text().includes('The first line must be exactly the header shown.'));
  assert.equal(h.host.one('svcm-bulk-create').hasAttribute('disabled'), true);
  await h.act('svcm-bulk-text', { value: M.TEMPLATE_HEADERS.part.join(',') + ',mobile\nA1,B' });
  await h.act('svcm-bulk-check');
  assert.ok(h.host.text().includes('The header has a column for personal details. Remove it.'));
  // stale plan
  const head = M.TEMPLATE_HEADERS.part.join(',');
  await h.act('svcm-bulk-text', { value: head + '\nTSB001,Ok,Battery,pc,,,10.00,yes,0,0,,\nTSB002,Ok2,Battery,pc,,,10.00,yes,0,0,,' });
  await h.act('svcm-bulk-check');
  M.createRow(h.env.store, h.env.ctx(OWNER, { clientRef: h.env.ref() }), 'part', part('TSB002'));
  const before = h.env.snapshot();
  await h.act('svcm-bulk-create');
  assert.equal(h.env.snapshot(), before);
  assert.ok(h.host.text().includes('This code already exists.'));
  // double press with a good plan creates once
  await h.act('svcm-bulk-text', { value: head + '\nTSB010,Ok,Battery,pc,,,10.00,yes,0,0,,' });
  await h.act('svcm-bulk-check');
  const commitsBefore = h.count('commitBulk');
  await Promise.all([h.ctl.dispatch('svcm-bulk-create'), h.ctl.dispatch('svcm-bulk-create')]);
  assert.equal(h.count('commitBulk') - commitsBefore, 1);
  assert.equal(M.loadMasters(h.env.store).parts.filter((r) => r.code === 'TSB010').length, 1);
});

test('J4. bulk labour uses the labour header', async () => {
  const h = makeHarness({ session: MANAGER });
  await h.load();
  await h.act('svcm-tab-labour');
  await h.act('svcm-bulk-open');
  assert.ok(h.host.text().includes(M.TEMPLATE_HEADERS.labour.join(',')));
  await h.act('svcm-bulk-check');
  assert.equal(h.last('planBulk').args[0], 'labour');
  assert.equal(h.ctl.state.bulk.plan.ok, true);
  await h.act('svcm-bulk-create');
  assert.equal(M.loadMasters(h.env.store).labour.length, 1);
});

test('K. the role is read fresh: a field edit reads once, a render reads once, nothing is cached', async () => {
  const h = makeHarness({ session: OWNER });
  await openAdd(h);
  let n = h.state.reads;
  await h.ctl.dispatch('svcm-field', { name: 'name', value: 'x' });
  assert.equal(h.state.reads - n, 1, 'one read per dispatch');
  n = h.state.reads;
  h.ctl.render();
  assert.equal(h.state.reads - n, 1, 'one read per render');
  h.state.session = STAFF;
  assert.equal(/"svcm-save"/.test(h.ctl.render()), true, 'form still open');
  await h.act('svcm-cancel');
  assert.equal(h.ctl.render().includes('"svcm-add"'), false, 'buttons gone as soon as the role drops');
  assert.equal(JSON.stringify(h.ctl.state).includes('Owner'), false, 'no role kept in state');
  assert.equal(JSON.stringify(h.ctl.state).includes('isOwner'), false);
});

test('L. openNew and openEdit for the Stores screen', async () => {
  const h = makeHarness({ session: MANAGER });
  h.seed('TST0001');
  h.seedLabour('TSTL001');
  await h.load();
  await h.ctl.openNew('labour');
  assert.equal(h.ctl.state.view, 'form');
  assert.equal(h.ctl.state.form.kind, 'labour');
  assert.equal(h.ctl.state.form.mode, 'create');
  assert.ok(h.host.text().includes('Add labour item'));
  await h.act('svcm-cancel');
  await h.ctl.openEdit('part', 'tst0001');
  assert.equal(h.ctl.state.form.mode, 'edit');
  assert.equal(h.ctl.state.form.rev, 1);
  assert.equal(h.ctl.state.form.code, 'TST0001');
  await h.act('svcm-cancel');
  await h.ctl.openEdit('labour', 'TSTL001');
  assert.equal(h.ctl.state.form.kind, 'labour');
  await h.act('svcm-cancel');
  await h.ctl.openEdit('part', 'NOPE');
  assert.ok(h.host.text().includes('This item was not found.'));
  assert.equal(h.ctl.state.view === 'form', false);
  h.state.session = STAFF;
  await h.ctl.openNew('part');
  assert.equal(h.ctl.state.view === 'form', false);
  assert.ok(h.host.text().includes('Only a Store Manager or the Owner can change the master.'));
  await h.ctl.openEdit('part', 'TST0001');
  assert.equal(h.ctl.state.view === 'form', false);
});

test('M. core failures: missing call, throw, junk reply and unknown code all end in a clear message', async () => {
  const cases = [
    [{ savePart: undefined }, 'Stores is not available in this build. Nothing was changed.'],
    [{ savePart: () => { throw new Error('private detail'); } }, 'Something went wrong. Check the list before trying again. Code: SVS_BAD_REPLY.'],
    [{ savePart: () => Promise.reject(new Error('private detail')) }, 'Something went wrong. Check the list before trying again. Code: SVS_BAD_REPLY.'],
    [{ savePart: () => 'junk' }, 'Something went wrong. Check the list before trying again. Code: SVS_BAD_REPLY.'],
    [{ savePart: () => null }, 'Something went wrong. Check the list before trying again. Code: SVS_BAD_REPLY.'],
    [{ savePart: () => ({ ok: false, code: 'ZZ_NEW_CODE' }) }, 'The store could not complete this action. Code: ZZ_NEW_CODE.'],
    [{ savePart: () => ({ ok: false, code: 'SVCS_REV_CONFLICT' }) }, 'Stores changed on another screen. Reload and try again.'],
    [{ savePart: () => ({ ok: 'true', code: 'X' }) }, 'The store could not complete this action. Code: X.']
  ];
  for (const [hooks, text] of cases) {
    const h = makeHarness({ session: OWNER, hooks });
    if ('savePart' in hooks && hooks.savePart === undefined) delete h.core.savePart;
    await openAdd(h);
    await h.fill(goodPart);
    await h.act('svcm-save');
    assert.ok(h.host.text().includes(text), text + ' / ' + h.host.text());
    assert.equal(h.host.text().includes('private detail'), false);
    assert.equal(h.ctl.state.view, 'form');
    assert.equal(h.ctl.state.busy, false);
    assert.equal(h.state.changes, 0);
  }
});

test('N. an old list reply never overwrites a newer one', async () => {
  const waits = [];
  const h = makeHarness({ session: OWNER });
  h.seed('TST0001');
  h.seed('TST0002');
  const real = h.core.listParts;
  h.core.listParts = (q, ctx) => new Promise((resolve) => { waits.push(() => resolve(real(q, ctx))); });
  const p1 = h.ctl.dispatch('svcm-search', { value: 'TST0001' });
  const p2 = h.ctl.dispatch('svcm-search', { value: 'TST0002' });
  while (waits.length < 2) await new Promise((r) => setImmediate(r));
  waits[1]();
  await p2;
  waits[0]();
  await p1;
  assert.deepEqual(h.ctl.state.list.rows.map((r) => r.code), ['TST0002']);
});

test('O. history failure is shown; tab switch clears filters; missing toast is fine', async () => {
  const h = makeHarness({ session: OWNER });
  h.seed('TST0001', { group: 'Battery' });
  h.core.history = () => ({ ok: false, code: 'SVCS_BLOCKED' });
  delete h.uiEnv.toast;
  const ctl = h.ctl;
  await h.load();
  await h.act('svcm-filter-group', { value: 'Battery' });
  await h.act('svcm-search', { value: 'abc' });
  await h.act('svcm-open', { code: 'TST0001', kind: 'part' });
  assert.ok(h.host.text().includes('safety check'));
  await h.act('svcm-tab-labour');
  assert.deepEqual([ctl.state.q, ctl.state.group, ctl.state.kind, ctl.state.view], ['', '', 'labour', 'list']);
});

test('P. every write is refused in a past-date view', async () => {
  const h = makeHarness({ session: OWNER });
  h.seed('TST0001');
  await h.load();
  h.state.past = true;
  assert.equal(h.ctl.render().includes('"svcm-add"'), false);
  const before = h.env.snapshot();
  for (const [a, p] of [['svcm-add', {}], ['svcm-edit', { code: 'TST0001' }], ['svcm-bulk-open', {}], ['svcm-deactivate', { code: 'TST0001', reason: 'not needed any more' }]]) await h.ctl.dispatch(a, p);
  assert.equal(h.env.snapshot(), before);
  assert.ok(h.state.toasts.every((t) => t.startsWith('You are viewing a past date.')));
  assert.equal(h.state.toasts.length, 4);
});

test('Q. unknown action names are ignored without a write', async () => {
  const h = makeHarness({ session: OWNER });
  await h.load();
  const before = h.env.snapshot();
  await h.ctl.dispatch('svcm-nope', {});
  await h.ctl.dispatch('', null);
  await h.ctl.dispatch('svs-part-save', {});
  assert.equal(h.env.snapshot(), before);
  assert.equal(h.state.toasts.length, 0);
});

test('R. labour create/edit round trip through the labour calls', async () => {
  const h = makeHarness({ session: OWNER });
  await h.load();
  await h.act('svcm-tab-labour');
  await h.act('svcm-add', { kind: 'labour' });
  await h.fill({ code: 'TSTL001', name: 'Movement service (invented)', group: 'Service', price: '500', basis: 'yes', tax: '998729', gst: '18' });
  await h.act('svcm-save');
  const input = h.last('saveLabour').args[0];
  assert.deepEqual([input.ratePaise, input.gstRateBp, input.sac, input.unit], [50000, 1800, '998729', 'job']);
  assert.equal(h.count('savePart'), 0);
  assert.equal(M.getRow(h.env.store, 'labour', 'TSTL001').ok, true);
  assert.equal(labour('X').ratePaise, 50000);
});

test('S. cancel from an edit opened on the detail page returns to the detail page; from the list returns to the list', async () => {
  const h = makeHarness({ session: OWNER });
  h.seed('TST0001');
  await h.load();
  await h.act('svcm-open', { code: 'TST0001', kind: 'part' });
  await h.act('svcm-edit', { code: 'TST0001', kind: 'part' });
  assert.equal(h.ctl.state.view, 'form');
  await h.act('svcm-cancel');
  assert.equal(h.ctl.state.view, 'detail');
  assert.equal(h.ctl.state.form, null);
  await h.act('svcm-back');
  await h.act('svcm-add', { kind: 'part' });
  await h.act('svcm-cancel');
  assert.equal(h.ctl.state.view, 'list');
  assert.equal(h.ctl.state.notice.text, '');
});

test('T. a partial list reply (missing arrays) does not crash the screen', async () => {
  for (const reply of [{ ok: true }, { ok: true, rows: 'x', total: 'y' }, { ok: true, rows: [null, 5, 'a'], total: 3, groups: 'nope' }]) {
    const h = makeHarness({ session: OWNER, hooks: { listParts: () => reply } });
    await h.load();
    const t = h.ctl.render();
    assert.ok(t.includes('Parts and labour'));
    assert.equal(/undefined|NaN|\[object/.test(t), false, t);
  }
});
